// POK client (https://pokpay.io). Credit packs are the only thing sold (see credit-purchases.ts).
// POK does not document a webhook signature, so a webhook is only a hint: the server always re-reads the order from
// the POK API before granting credits, and the webhook URL carries an HMAC of the purchase ID to drop forged calls early.
import {serviceConfig} from './connections';
import {config,must,one,type Row} from './data';
import {constantEqual,sign} from './security';
import {boundedText} from './http';
import {reportError} from './errors';

const hosts={production:'https://api.pokpay.io',staging:'https://api-staging.pokpay.io'} as const;
// Where the customer pays: POK's SDK opens {app}/sdk-orders/{id} when the order reply carries no link of its own.
const appHosts={production:'https://app.pokpay.io',staging:'https://app-staging.pokpay.io'} as const;
/** Field names only (never values) of a POK reply, for the error log when its shape is not what we expect. */
const shape=(v:unknown,depth=0):unknown=>v&&typeof v==='object'&&!Array.isArray(v)&&depth<3?Object.fromEntries(Object.entries(v as Row).map(([k,x])=>[k,x&&typeof x==='object'&&!Array.isArray(x)?shape(x,depth+1):typeof x])):typeof v;
/** The order inside a POK reply: data.sdkOrder (documented), or the same without the data wrapper. */
const orderIn=(data:Row,raw:Row):Row|undefined=>(data.sdkOrder||raw.sdkOrder||(typeof data.id==='string'?data:undefined)) as Row|undefined;
export const pokCurrencies=['ALL','EUR'] as const;

// Access tokens are cached per isolate until shortly before they expire.
let session:{token:string;expires:number;owner:string}|null=null;
// The SDK sends the raw token in Authorization; fall back to the Bearer form once if POK rejects it.
let scheme:''|'Bearer '='';

async function pokConfig(){
 const c=await serviceConfig();
 must(c.pokKeyId&&c.pokKeySecret&&c.pokMerchantId,'POK is not configured.',503);
 return {...c,base:hosts[c.pokEnvironment==='production'?'production':'staging']};
}
async function call(base:string,path:string,init:RequestInit){
 const r=await fetch(base+path,{...init,signal:AbortSignal.timeout(15000),redirect:'manual'});
 let data:Row={};try{data=await r.json() as Row}catch{/* POK error pages are not JSON */}
 return {r,data};
}
async function token(force=false){
 const c=await pokConfig(),owner=c.base+'|'+c.pokKeyId;
 if(!force&&session&&session.owner===owner&&session.expires>Date.now()+60000)return {c,token:session.token};
 const {r,data}=await call(c.base,'/auth/sdk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyId:c.pokKeyId,keySecret:c.pokKeySecret})});
 const d=data.data||{};
 if(!r.ok||typeof d.accessToken!=='string'){await reportError('payment','POK login failed',{context:{status:r.status}});throw new Error('The payment service is unavailable. Please try again.');}
 const expires=d.expiresAt?Date.parse(d.expiresAt):Date.now()+Number(d.expiresIn||600)*1000;
 session={token:d.accessToken,expires:Number.isFinite(expires)?expires:Date.now()+600000,owner};
 return {c,token:session.token};
}
export async function pok(path:string,body?:Row){
 let {c,token:t}=await token();
 const send=()=>call(c.base,path,{method:body?'POST':'GET',headers:{Authorization:scheme+t,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 let {r,data}=await send();
 if(r.status===401){
  ({c,token:t}=await token(true));({r,data}=await send());
  if(r.status===401){scheme=scheme?'':'Bearer ';({r,data}=await send());}
 }
 if(!r.ok){await reportError('payment','POK request failed',{context:{status:r.status,code:String(data.message||data.code||'')}});throw new Error('The payment service is unavailable. Please try again.');}
 return {data:(data.data||{}) as Row,raw:data,merchantId:c.pokMerchantId,environment:c.pokEnvironment};
}

/** POK amounts are in major units; the studio stores minor units. ALL is sold in whole lek. */
export const pokAmount=(amount:number,currency:string)=>currency==='ALL'?String(Math.round(amount/100)):(amount/100).toFixed(2);
const webhookPath=async(purchaseId:string)=>`/api/webhooks/pok?purchase=${encodeURIComponent(purchaseId)}&sig=${await sign('pok-webhook:'+purchaseId)}`;

/** Creates a POK order for a purchase and returns its ID and the page where the customer pays. */
export async function createPokOrder(o:{id:string;amount:number;currency:string;name:string;successPath:string;cancelPath:string}){
 must((pokCurrencies as readonly string[]).includes(o.currency),'POK accepts payments in ALL and EUR only.',400);
 const c=await serviceConfig();const origin=config().origin;
 const {data,raw,environment}=await pok(`/merchants/${encodeURIComponent(c.pokMerchantId)}/sdk-orders`,{
  amount:pokAmount(o.amount,o.currency),currencyCode:o.currency,autoCapture:true,products:[],description:o.name,
  merchantCustomReference:o.id,expiresAfterMinutes:30,
  redirectUrl:origin+o.successPath,failRedirectUrl:origin+o.cancelPath,webhookUrl:origin+await webhookPath(o.id),
 });
 const order=orderIn(data,raw)||{};
 const id=typeof order.id==='string'?order.id:typeof data.sdkOrderId==='string'?data.sdkOrderId:'';
 const link=(order.self||order._self||{}) as Row;
 let url=typeof link.confirmUrl==='string'?link.confirmUrl:typeof order.confirmUrl==='string'?order.confirmUrl:'';
 if(id&&!url)url=appHosts[environment==='production'?'production':'staging']+'/sdk-orders/'+encodeURIComponent(id);
 if(!id)await reportError('payment','POK order reply had no order ID',{context:{fields:JSON.stringify(shape(raw)).slice(0,1500)}});
 must(id&&url,'Checkout was not ready. Please try again.',502);
 return {id,url};
}
export async function getPokOrder(orderId:string){
 const {data,raw}=await pok('/sdk-orders/'+encodeURIComponent(orderId));const order=orderIn(data,raw);
 if(!order)await reportError('payment','POK order status reply had no order',{context:{orderId,fields:JSON.stringify(shape(raw)).slice(0,1500)}});
 return order;
}

/** Reads the state of a purchase's order from what POK returns: paid only when the full amount was captured. */
export function pokOrderState(order:Row|undefined,purchase:Row):'paid'|'expired'|'open'|'mismatch'{
 if(!order||order.id!==purchase.provider_session_id)return 'mismatch';
 if(order.merchantCustomReference&&order.merchantCustomReference!==purchase.id)return 'mismatch';
 if(String(order.currencyCode||'').toUpperCase()!==purchase.currency)return 'mismatch';
 const expected=Number(pokAmount(purchase.amount,purchase.currency));
 if(Math.abs(Number(order.amount)-expected)>0.005)return 'mismatch';
 if(Number(order.capturedAmount)>=expected-0.005)return 'paid';
 return order.expiresAt&&Date.parse(order.expiresAt)<Date.now()?'expired':'open';
}

/** Verifies the signed purchase reference and returns the purchase to re-check, or null for unknown calls. */
export async function pokWebhook(request:Request){
 await boundedText(request);
 const url=new URL(request.url),purchaseId=url.searchParams.get('purchase')||'',signature=url.searchParams.get('sig')||'';
 must(purchaseId&&signature&&constantEqual(signature,await sign('pok-webhook:'+purchaseId)),'Invalid webhook signature.',400);
 return one("SELECT * FROM credit_purchases WHERE id=? AND provider='pok'",purchaseId);
}
