import {purchaseReadiness,serviceConfig} from './connections';
import {all,batch,config,event,must,now,one,run,stmt,type Row} from './data';
import {constantEqual} from './security';
import {boundedText} from './http';
import {providerFor} from './providers';

export interface PaymentGateway {
  create(order:Row,email:string,attempt?:number):Promise<{id:string;url:string}>;
  refund(payment:Row,refundId:string):Promise<{id:string;status:string}>;
}
async function stripe(path:string,body?:Record<string,string>,idempotencyKey?:string){
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
export class StripeGateway implements PaymentGateway {
  async create(o:Row,email:string,attempt=0){
    const d=await stripe('checkout/sessions',{
      mode:'payment',customer_email:email,client_reference_id:o.id,'metadata[order_id]':o.id,'payment_intent_data[metadata][order_id]':o.id,
      'line_items[0][price_data][currency]':o.currency.toLowerCase(),'line_items[0][price_data][unit_amount]':String(o.amount),
      'line_items[0][price_data][product_data][name]':o.template_name,'line_items[0][quantity]':'1',
      success_url:`${config().origin}/checkout/${o.id}?returned=1`,cancel_url:`${config().origin}/checkout/${o.id}?cancelled=1`,
    },`checkout:${o.id}:${attempt}`);
    must(typeof d.id==='string'&&typeof d.url==='string','Checkout was not ready. Please try again.',502);
    return {id:d.id,url:d.url};
  }
  async refund(p:Row,refundId:string){
    must(p.provider_transaction_id,'Payment is not settled.',409);
    const d=await stripe('refunds',{payment_intent:p.provider_transaction_id,amount:String(p.amount),'metadata[studio_refund_id]':refundId},'refund:'+refundId);
    return {id:d.id,status:d.status};
  }
}
export class MockPaymentGateway implements PaymentGateway {
  async create(o:Row){must(config().demo,'Test payment is disabled.',403);return {id:'test_'+o.id,url:'/checkout/'+o.id};}
  async refund(_p:Row,id:string){must(config().demo,'Test refunds are disabled.',403);return {id:'test_'+id,status:'succeeded'};}
}
const gatewayFor=(provider:string):PaymentGateway=>provider==='mock'?new MockPaymentGateway():new StripeGateway();
export const gateway=():PaymentGateway=>gatewayFor(config().demo?'mock':'stripe');

export async function ensureCheckout(order:Row,email:string,retry=false){
  let payment=await one('SELECT * FROM payments WHERE order_id=?',order.id);
  must(payment,'Payment was not found.',404);
  must(config().demo||payment.provider!=='mock','This test order cannot be paid in production.',403);
  if(!config().demo&&!['paid','refunded'].includes(payment.status))must((await purchaseReadiness()).ready,'Video creation is not open yet. Please check back soon.',503);
  if(['paid','refunded'].includes(payment.status))return {id:payment.provider_session_id,url:'/checkout/'+order.id};
  const generation=await one('SELECT deleted_at,user_id FROM generations WHERE id=?',order.generation_id);
  must(generation&&!generation.deleted_at&&generation.user_id,'This creation was removed. Choose a template to start again.',409);
  if(retry&&payment.provider==='stripe'&&payment.provider_session_id){
    const s=await stripe('checkout/sessions/'+encodeURIComponent(payment.provider_session_id));
    if(s.payment_status==='paid'){
      await confirmPayment(order.id,s.id,s.payment_intent,s.amount_total,s.currency);
      return {id:s.id,url:'/checkout/'+order.id};
    }
    must(s.status!=='complete','Your payment is still being confirmed. Check Orders in a moment.',409);
    if(s.status==='expired'){
      await run("UPDATE payments SET provider_session_id=NULL,checkout_url=NULL,checkout_attempt=checkout_attempt+1,status='pending' WHERE id=? AND provider_session_id=? AND status IN ('pending','failed')",payment.id,payment.provider_session_id);
      payment=await one('SELECT * FROM payments WHERE id=?',payment.id);
      must(payment,'Payment was not found.',404);
  must(config().demo||payment.provider!=='mock','This test order cannot be paid in production.',403);
  if(!config().demo&&!['paid','refunded'].includes(payment.status))must((await purchaseReadiness()).ready,'Video creation is not open yet. Please check back soon.',503);
    }
  }
  if(retry)await batch([
    stmt("UPDATE payments SET status='pending' WHERE id=? AND status='failed'",payment.id),
    stmt("UPDATE orders SET status='pending' WHERE id=? AND status='failed' AND EXISTS (SELECT 1 FROM payments WHERE order_id=? AND status='pending')",order.id,order.id),
  ]);
  if(payment.checkout_url)return {id:payment.provider_session_id,url:payment.checkout_url};
  const s=await gatewayFor(payment.provider).create(order,email,payment.checkout_attempt);
  await run("UPDATE payments SET provider_session_id=?,checkout_url=? WHERE id=? AND provider_session_id IS NULL AND checkout_attempt=? AND status IN ('pending','failed')",s.id,s.url,payment.id,payment.checkout_attempt);
  const saved=await one('SELECT provider_session_id,checkout_url,status FROM payments WHERE id=?',payment.id);
  must(saved?.provider_session_id===s.id,'Checkout changed. Please refresh your order.',409);
  return {id:saved.provider_session_id,url:saved.checkout_url};
}

export async function confirmPayment(orderId:string,sessionId:string,transactionId:string,amount:number,currency:string){
  const p=await one('SELECT p.*,o.generation_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.order_id=?',orderId);
  must(p,'Payment not found.',404);
  must(p.provider_session_id===sessionId&&p.amount===amount&&typeof currency==='string'&&p.currency.toLowerCase()===currency.toLowerCase()&&typeof transactionId==='string','Payment details did not match the order.',400);
  // Atomic handoff tolerates concurrent confirmations and refunds.
  const changes=await batch([
    stmt("UPDATE payments SET status='paid',provider_transaction_id=?,paid_at=? WHERE id=? AND status IN ('pending','failed')",transactionId,now(),p.id),
    stmt("UPDATE orders SET status='paid' WHERE id=? AND status IN ('pending','failed') AND EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid')",orderId,p.id),
    stmt("UPDATE generations SET status='queued',next_run_at=? WHERE id=? AND status='awaiting_payment' AND deleted_at IS NULL AND user_id IS NOT NULL AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')",now(),p.generation_id,orderId),
  ]);
  const changed=changes[0].meta.changes>0;
  if(changed)await event('payment_completed',null,{orderId});
  const generation=await one('SELECT deleted_at,user_id FROM generations WHERE id=?',p.generation_id);
  if((!generation||generation.deleted_at||!generation.user_id)&&p.status!=='refunded')await refundOrder(orderId,'Creation removed before payment settled');
  return changed;
}
export async function verifyCheckout(orderId:string){
  const p=await one('SELECT * FROM payments WHERE order_id=?',orderId);
  must(p,'Payment not found.',404);
  if(p.provider!=='stripe'||p.status==='paid'||p.status==='refunded')return;
  must(p.provider_session_id,'Checkout is not ready.',409);
  const s=await stripe('checkout/sessions/'+encodeURIComponent(p.provider_session_id));
  if(s.payment_status==='paid')await confirmPayment(orderId,s.id,s.payment_intent,s.amount_total,s.currency);
  else if(s.status==='expired')await failPayment(orderId,s.id);
}
export async function failPayment(orderId:string,sessionId?:string){
  const result=await batch([
    stmt("UPDATE payments SET status='failed' WHERE order_id=? AND status='pending'"+(sessionId?' AND provider_session_id=?':''),orderId,...(sessionId?[sessionId]:[])),
    stmt("UPDATE orders SET status='failed' WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM payments WHERE order_id=? AND status='failed')",orderId,orderId),
  ]);
  if(result[0].meta.changes)await event('payment_failed',null,{orderId});
}

async function settleRefund(p:Row,providerRefundId?:string){
  const g=await one('SELECT generation_id FROM orders WHERE id=?',p.order_id);
  const running=g?await all("SELECT provider,provider_job_id FROM generation_steps WHERE generation_id=? AND status IN ('submitting','generating')",g.generation_id):[];
  await batch([
    stmt("UPDATE payments SET status='refunded' WHERE id=?",p.id),
    stmt("UPDATE orders SET status='refunded' WHERE id=?",p.order_id),
    stmt("INSERT INTO refunds (id,payment_id,amount,reason,status,provider_refund_id,created_at) VALUES (?,?,?,'Payment provider refund','succeeded',?,?) ON CONFLICT(payment_id) DO UPDATE SET status='succeeded',error=NULL,provider_refund_id=COALESCE(excluded.provider_refund_id,refunds.provider_refund_id)",'ref_'+p.id,p.id,p.amount,providerRefundId||null,now()),
    ...(g?[
      stmt("UPDATE generations SET status='failed',error='This payment was refunded. Start a new creation to try again.',internal_error='Payment refunded before delivery',completed_at=?,lease_token=NULL,lease_until=0 WHERE id=? AND status IN ('awaiting_payment','queued','preparing','generating','finalizing')",now(),g.generation_id),
      stmt("UPDATE generation_steps SET status='cancelled',error='Payment refunded',completed_at=? WHERE generation_id=? AND status IN ('submitting','generating')",now(),g.generation_id),
    ]:[]),
  ]);
  // Cancellation is best effort; the database prevents a refunded job from resuming.
  const results=await Promise.allSettled(running.filter(s=>s.provider_job_id).map(s=>providerFor(s.provider).cancelJob(s.provider_job_id)));
  if(results.some(r=>r.status==='rejected'))console.error('Refunded provider job needs cancellation review',p.id);
}
export async function refundOrder(orderId:string,reason='Generation failed'){
  const p=await one('SELECT * FROM payments WHERE order_id=?',orderId);
  must(p&&['paid','refunded'].includes(p.status),'Only a confirmed payment can be refunded.',409);
  if(p.status==='refunded')return;
  const refundId='ref_'+p.id;
  await run('INSERT OR IGNORE INTO refunds (id,payment_id,amount,reason,status,created_at) VALUES (?,?,?,?,?,?)',refundId,p.id,p.amount,reason,'pending',now());
  try{
    const existing=await one('SELECT * FROM refunds WHERE id=?',refundId);
    // Reconcile accepted refunds before retrying because Stripe idempotency keys expire.
    const result=p.provider==='stripe'&&existing?.provider_refund_id
      ?await stripe('refunds/'+encodeURIComponent(existing.provider_refund_id))
      :await gatewayFor(p.provider).refund(p,refundId);
    await run('UPDATE refunds SET provider_refund_id=?,status=?,error=NULL WHERE id=?',result.id,result.status,refundId);
    if(result.status==='succeeded')await settleRefund(p,result.id);
  }catch(e){await run("UPDATE refunds SET status='failed',error=? WHERE id=? AND status!='succeeded'",e instanceof Error?e.message:'Refund request failed',refundId);throw e;}
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
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type)&&s.payment_status==='paid')await confirmPayment(s.metadata?.order_id,s.id,s.payment_intent,s.amount_total,s.currency);
  if(['checkout.session.async_payment_failed','checkout.session.expired'].includes(e.type)&&s.metadata?.order_id)await failPayment(s.metadata.order_id,s.id);
  if(e.type==='charge.refunded'&&s.refunded){
    const p=await one('SELECT * FROM payments WHERE provider_transaction_id=?',s.payment_intent);
    if(p)await settleRefund(p,s.refunds?.data?.[0]?.id);
  }
  if(e.type==='refund.updated'){
    await run('UPDATE refunds SET status=?,error=? WHERE provider_refund_id=?',s.status,s.failure_reason||null,s.id);
    if(s.status==='succeeded'){
      const p=await one('SELECT p.* FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.provider_refund_id=?',s.id);
      if(p)await settleRefund(p,s.id);
    }
  }
  await run('INSERT OR IGNORE INTO webhook_events (id,type,processed_at) VALUES (?,?,?)',e.id,e.type,now());
}
