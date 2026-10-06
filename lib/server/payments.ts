// Stripe client and webhook. Credit packs are the only thing sold (see credit-purchases.ts); per-video orders were removed.
import {serviceConfig} from './connections';
import {config,must,now,one,run,type Row} from './data';
import {constantEqual} from './security';
import {boundedText} from './http';
import {confirmPackPayment,failPackPayment,reversePackPayment} from './credit-purchases';

export async function stripe(path:string,body?:Record<string,string>,idempotencyKey?:string){
  const c=await serviceConfig();must(c.stripeKey,'Stripe is not configured.',503);
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{
    method:body?'POST':'GET',
    headers:{Authorization:`Bearer ${c.stripeKey}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
    body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual',
  });
  const data=await r.json() as Row;
  if(!r.ok){console.error('Stripe request failed',r.status,data.error?.type);throw new Error('The payment service is unavailable. Please try again.');}
  return data;
}
/** One-time Stripe Checkout session; the webhook routes on the `reference` metadata key. */
export async function createStripeCheckout(o:{reference:'purchase_id';id:string;amount:number;currency:string;name:string;email:string;attempt:number;successPath:string;cancelPath:string}){
  const d=await stripe('checkout/sessions',{
    mode:'payment',customer_email:o.email,client_reference_id:o.id,[`metadata[${o.reference}]`]:o.id,[`payment_intent_data[metadata][${o.reference}]`]:o.id,
    'line_items[0][price_data][currency]':o.currency.toLowerCase(),'line_items[0][price_data][unit_amount]':String(o.amount),
    'line_items[0][price_data][product_data][name]':o.name,'line_items[0][quantity]':'1',
    success_url:config().origin+o.successPath,cancel_url:config().origin+o.cancelPath,
  },`checkout:${o.id}:${o.attempt}`);
  must(typeof d.id==='string'&&typeof d.url==='string','Checkout was not ready. Please try again.',502);
  return {id:d.id as string,url:d.url as string};
}

export async function stripeWebhook(request:Request){
  const body=await boundedText(request);
  const parts=(request.headers.get('stripe-signature')||'').split(',');
  const timestamp=parts.find(p=>p.startsWith('t='))?.slice(2),signatures=parts.filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
  must(timestamp&&Math.abs(Date.now()/1000-Number(timestamp))<300,'Expired webhook signature.',400);
  const c=await serviceConfig();must(c.webhookSecret,'Webhook is not configured.',503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  must(signatures.some(s=>constantEqual(s,sig)),'Invalid webhook signature.',400);
  let e:Row;try{e=JSON.parse(body)}catch{must(false,'Invalid webhook JSON.');}
  must(typeof e.id==='string'&&e.data?.object,'Invalid webhook.');
  if(await one('SELECT id FROM webhook_events WHERE id=?',e.id))return;
  const s=e.data.object;
  const purchaseId=typeof s.metadata?.purchase_id==='string'?s.metadata.purchase_id:null;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type)&&s.payment_status==='paid'&&purchaseId)await confirmPackPayment(purchaseId,s.id,s.payment_intent,s.amount_total,s.currency);
  if(['checkout.session.async_payment_failed','checkout.session.expired'].includes(e.type)&&purchaseId)await failPackPayment(purchaseId,s.id);
  // Packs are not refundable, but a bank can reverse a payment and the owner can refund by hand in Stripe.
  if(e.type==='charge.refunded'&&s.refunded&&typeof s.payment_intent==='string')await reversePackPayment(s.payment_intent,'Payment refunded');
  if(e.type==='charge.dispute.created'&&typeof s.payment_intent==='string')await reversePackPayment(s.payment_intent,'Payment disputed');
  await run('INSERT OR IGNORE INTO webhook_events (id,type,processed_at) VALUES (?,?,?)',e.id,e.type,now());
}
