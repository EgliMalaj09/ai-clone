// A local stand-in for the POK API (login, create order, read order), shaped like POK's PHP SDK models.
// Tests change an order's state with pay/expire and deliver its webhook with notify.
import assert from 'node:assert/strict';

export function fakePok({keyId,keySecret,merchantId,Response}){
 const orders=new Map(),created=[];let serial=0;const token='pok_token_'+Math.random().toString(36).slice(2);
 const json=(data,status=200)=>Response.json(data,{status});
 return {
  orders,created,
  matches:url=>url.hostname==='api-staging.pokpay.io'||url.hostname==='api.pokpay.io',
  async handle(req){
   const url=new URL(req.url);
   if(url.pathname==='/auth/sdk/login'&&req.method==='POST'){const b=await req.json();if(b.keyId!==keyId||b.keySecret!==keySecret)return json({message:'Invalid credentials'},401);return json({data:{accessToken:token,expiresIn:'3600',tokenType:'Bearer'}});}
   if(req.headers.get('authorization')!==token)return json({message:'Unauthorized'},401);
   if(url.pathname===`/merchants/${merchantId}/sdk-orders`&&req.method==='POST'){
    const b=await req.json();const id='ord_'+(++serial);created.push(b);
    const order={id,amount:Number(b.amount),capturedAmount:0,currencyCode:b.currencyCode,finalAmount:Number(b.amount),merchantCustomReference:b.merchantCustomReference,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+(b.expiresAfterMinutes||30)*60000).toISOString(),redirectUrl:b.redirectUrl,failRedirectUrl:b.failRedirectUrl,self:{confirmUrl:'https://pay.pokpay.io/confirm/'+id},webhookUrl:b.webhookUrl};
    orders.set(id,order);return json({data:{sdkOrder:order}},201);
   }
   const read=url.pathname.match(/^\/sdk-orders\/([^/]+)$/);
   if(read&&req.method==='GET'){const order=orders.get(read[1]);return order?json({data:{sdkOrder:order}}):json({message:'Not found'},404);}
   throw new Error('Unexpected POK call: '+req.method+' '+url.pathname);
  },
  last:()=>[...orders.values()].at(-1),
  pay(id,amount){const o=orders.get(id);assert(o,'Unknown POK order '+id);o.capturedAmount=amount??o.amount;return o;},
  expire(id){const o=orders.get(id);assert(o,'Unknown POK order '+id);o.expiresAt=new Date(Date.now()-1000).toISOString();return o;},
  /** Posts the order to its webhook URL the way POK does, through the given dispatchFetch. */
  notify(id,dispatchFetch,{url:override,expected=200}={}){const o=orders.get(id);return dispatchFetch(override||o.webhookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:{sdkOrder:o}})}).then(async r=>{if(expected!==null)assert.equal(r.status,expected,'POK webhook: '+await r.text());return r;});},
 };
}
