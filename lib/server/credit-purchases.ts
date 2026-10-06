// Credit packs and their purchases. Payment confirmation grants the pack's credits in the same atomic credit
// transaction that marks the purchase paid, so a retried or concurrent webhook can never grant twice.
import {z} from 'zod';
import {all,audit,config,event,HttpError,must,now,one,parse,run,stmt,uid,type Row} from './data';
import {purchaseReadiness} from './connections';
import {pageQuery} from './http';
import {createStripeCheckout,stripe} from './payments';
import {available,onlyIfApplied,post,SYSTEM} from './credits';
import type {StudioUser} from '../contracts';

export const packCurrencies=['USD','EUR','GBP','ALL'] as const;
export const packageSchema=z.object({
 name:z.string().trim().min(2).max(60),credits:z.number().int().min(1).max(1000000),bonusCredits:z.number().int().min(0).max(1000000).default(0),
 prices:z.record(z.enum(packCurrencies),z.number().int().min(50).max(100000000)).refine(p=>Object.keys(p).length>0,'Add at least one price.'),
 active:z.boolean(),sortOrder:z.number().int().min(0).max(1000).default(0),
});
const purchasePath=(id:string)=>'/credits?purchase='+id;
const publicPackage=(p:Row)=>({id:p.id as string,name:p.name as string,credits:Number(p.credits),bonusCredits:Number(p.bonus_credits),totalCredits:Number(p.credits)+Number(p.bonus_credits),prices:parse<Record<string,number>>(p.prices,{}),active:!!p.active,sortOrder:Number(p.sort_order)});
const publicPurchase=(p:Row)=>({id:p.id,packageName:p.package_name,credits:p.credits,amount:p.amount,currency:p.currency,status:p.status,provider:p.provider,createdAt:p.created_at,paidAt:p.paid_at});

export async function listPackages(includeInactive=false){
 return (await all(`SELECT * FROM credit_packages${includeInactive?'':' WHERE active=1'} ORDER BY sort_order,credits,id`)).map(publicPackage);
}
/** Lowest price of one credit per currency across active packs (minor units, fractional). Used for margin estimates. */
export async function creditValues(){
 const values:Record<string,number>={};
 for(const p of await listPackages())for(const [currency,price] of Object.entries(p.prices)){const v=price/p.totalCredits;if(values[currency]===undefined||v<values[currency])values[currency]=v;}
 return values;
}
export async function savePackage(id:string|null,input:unknown,user:StudioUser){
 const b=packageSchema.parse(input);
 if(id)must(await one('SELECT id FROM credit_packages WHERE id=?',id),'Credit pack not found.',404);
 const packId=id||uid('pack_'),t=now();
 if(id)await run('UPDATE credit_packages SET name=?,credits=?,bonus_credits=?,prices=?,active=?,sort_order=?,updated_at=? WHERE id=?',b.name,b.credits,b.bonusCredits,JSON.stringify(b.prices),Number(b.active),b.sortOrder,t,packId);
 else await run('INSERT INTO credit_packages (id,name,credits,bonus_credits,prices,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',packId,b.name,b.credits,b.bonusCredits,JSON.stringify(b.prices),Number(b.active),b.sortOrder,t,t);
 await audit(user.id,id?'credit-pack.update':'credit-pack.create',packId);
 return publicPackage((await one('SELECT * FROM credit_packages WHERE id=?',packId))!);
}
/** Purchases keep a snapshot of the pack, so removing a pack never changes past purchases. */
export async function deletePackage(id:string,user:StudioUser){
 must(await one('SELECT id FROM credit_packages WHERE id=?',id),'Credit pack not found.',404);
 await run('DELETE FROM credit_packages WHERE id=?',id);await audit(user.id,'credit-pack.delete',id);
}

export async function startPackCheckout(user:StudioUser,input:unknown){
 const b=z.object({packageId:z.string().max(100),currency:z.enum(packCurrencies),idempotencyKey:z.string().uuid(),consent:z.literal(true)}).parse(input);
 must(user.emailVerified,'Verify your email before buying credits.',403);
 const prior=await one('SELECT * FROM credit_purchases WHERE user_id=? AND idempotency_key=?',user.id,b.idempotencyKey);
 if(prior){must(prior.package_id===b.packageId&&prior.currency===b.currency,'This checkout key was already used for another purchase.',409);return {purchaseId:prior.id,...await ensurePackCheckout(prior,user.email)};}
 const pack=await one('SELECT * FROM credit_packages WHERE id=? AND active=1',b.packageId);must(pack,'This credit pack is not available.',404);
 const amount=parse<Record<string,number>>(pack.prices,{})[b.currency];must(Number.isSafeInteger(amount)&&amount>0,'This pack is not sold in that currency.',400);
 if(!config().demo)must((await purchaseReadiness()).ready,'Buying credits is not open yet. Please check back soon.',503);
 const id=uid('cp_');
 try{await run('INSERT INTO credit_purchases (id,user_id,package_id,package_name,credits,amount,currency,status,provider,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  id,user.id,pack.id,pack.name,Number(pack.credits)+Number(pack.bonus_credits),amount,b.currency,'pending',config().demo?'mock':'stripe',b.idempotencyKey,now());}
 catch(e){const duplicate=await one('SELECT * FROM credit_purchases WHERE user_id=? AND idempotency_key=?',user.id,b.idempotencyKey);if(duplicate)return {purchaseId:duplicate.id,...await ensurePackCheckout(duplicate,user.email)};throw e}
 await event('credits_checkout_started',user.id,{purchaseId:id});
 return {purchaseId:id,...await ensurePackCheckout((await one('SELECT * FROM credit_purchases WHERE id=?',id))!,user.email)};
}

/** Returns a checkout URL for the purchase, reusing an open session and replacing an expired Stripe one. */
export async function ensurePackCheckout(purchase:Row,email:string,retry=false){
 let p=purchase;
 must(config().demo||p.provider!=='mock','This test purchase cannot be paid in production.',403);
 if(['paid','reversed'].includes(p.status))return {url:purchasePath(p.id)};
 if(retry&&p.provider==='stripe'&&p.provider_session_id){
  const s=await stripe('checkout/sessions/'+encodeURIComponent(p.provider_session_id));
  if(s.payment_status==='paid'){await confirmPackPayment(p.id,s.id,s.payment_intent,s.amount_total,s.currency);return {url:purchasePath(p.id)};}
  must(s.status!=='complete','Your payment is still being confirmed. Check back in a moment.',409);
  if(s.status==='expired'){
   await run("UPDATE credit_purchases SET provider_session_id=NULL,checkout_url=NULL,checkout_attempt=checkout_attempt+1,status='pending' WHERE id=? AND provider_session_id=? AND status IN ('pending','failed')",p.id,p.provider_session_id);
   p=(await one('SELECT * FROM credit_purchases WHERE id=?',p.id))!;
  }
 }
 if(retry&&p.status==='failed'){await run("UPDATE credit_purchases SET status='pending' WHERE id=? AND status='failed'",p.id);}
 if(p.checkout_url)return {url:p.checkout_url as string};
 const session=p.provider==='mock'?{id:'test_'+p.id,url:'/credits/checkout/'+p.id}
  :await createStripeCheckout({reference:'purchase_id',id:p.id,amount:p.amount,currency:p.currency,name:`${p.package_name} · ${p.credits} credits`,email,attempt:p.checkout_attempt,successPath:purchasePath(p.id)+'&returned=1',cancelPath:'/credits?cancelled=1'});
 await run("UPDATE credit_purchases SET provider_session_id=?,checkout_url=? WHERE id=? AND provider_session_id IS NULL AND checkout_attempt=? AND status IN ('pending','failed')",session.id,session.url,p.id,p.checkout_attempt);
 const saved=await one('SELECT provider_session_id,checkout_url FROM credit_purchases WHERE id=?',p.id);
 must(saved?.provider_session_id===session.id,'Checkout changed. Please refresh and try again.',409);
 return {url:saved.checkout_url as string};
}

/** Marks the purchase paid and grants its credits in one transaction; returns false if nothing changed. */
export async function confirmPackPayment(purchaseId:string,sessionId:string,transactionId:string,amount:number,currency:string){
 const p=await one('SELECT * FROM credit_purchases WHERE id=?',purchaseId);
 must(p,'Credit purchase not found.',404);
 must(p.provider_session_id===sessionId&&p.amount===amount&&typeof currency==='string'&&p.currency.toLowerCase()===currency.toLowerCase()&&typeof transactionId==='string','Payment details did not match the purchase.',400);
 if(!p.user_id){
  await run("UPDATE credit_purchases SET status='paid',provider_transaction_id=?,paid_at=? WHERE id=? AND status IN ('pending','failed')",transactionId,now(),p.id);
  console.error('Paid credit purchase has no account and needs review',p.id);return false;
 }
 // Only an open purchase can be paid: a reversed purchase must never be granted again.
 const open={sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status IN ('pending','failed'))",args:[p.id]};
 const result=await post({kind:'purchase',key:'purchase:'+p.id,userId:p.user_id,referenceType:'credit_purchase',referenceId:p.id,reason:p.package_name,condition:open,
  moves:[{account:SYSTEM.issued,amount:-p.credits},{account:available(p.user_id),amount:p.credits}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='paid',provider_transaction_id=?,paid_at=? WHERE id=? AND status IN ('pending','failed') AND ${g.sql}`,transactionId,now(),p.id,...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(result?.applied)await event('credits_purchased',p.user_id,{purchaseId:p.id,credits:p.credits});
 return !!result?.applied;
}
export async function failPackPayment(purchaseId:string,sessionId?:string){
 const r=await run("UPDATE credit_purchases SET status='failed' WHERE id=? AND status='pending'"+(sessionId?' AND provider_session_id=?':''),purchaseId,...(sessionId?[sessionId]:[]));
 if(r.meta.changes)await event('credits_payment_failed',null,{purchaseId});
}
/** A reversed payment removes the purchased credits, even if that takes the balance below zero. */
export async function reversePackPayment(providerTransactionId:string,reason:string){
 const p=await one('SELECT * FROM credit_purchases WHERE provider_transaction_id=?',providerTransactionId);
 if(!p||p.status!=='paid')return false;
 if(!p.user_id){await run("UPDATE credit_purchases SET status='reversed' WHERE id=? AND status='paid'",p.id);return false;}
 const result=await post({kind:'reversal',key:'reversal:'+p.id,userId:p.user_id,referenceType:'credit_purchase',referenceId:p.id,reason,allowNegative:true,
  condition:{sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status='paid')",args:[p.id]},
  moves:[{account:available(p.user_id),amount:-p.credits},{account:SYSTEM.refunded,amount:p.credits}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='reversed' WHERE id=? AND status='paid' AND ${g.sql}`,p.id,...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(result?.applied){console.error('Credit purchase payment reversed; review the account',p.id);await event('credits_payment_reversed',p.user_id,{purchaseId:p.id});}
 return !!result?.applied;
}

export async function purchaseFor(userId:string,id:string){const p=await one('SELECT * FROM credit_purchases WHERE id=? AND user_id=?',id,userId);must(p,'Purchase not found.',404);return p;}
export async function verifyPackCheckout(p:Row){
 if(p.provider!=='stripe'||['paid','reversed'].includes(p.status))return;
 must(p.provider_session_id,'Checkout is not ready.',409);
 const s=await stripe('checkout/sessions/'+encodeURIComponent(p.provider_session_id));
 if(s.payment_status==='paid')await confirmPackPayment(p.id,s.id,s.payment_intent,s.amount_total,s.currency);
 else if(s.status==='expired')await failPackPayment(p.id,s.id);
}
export async function payTestPurchase(p:Row,result:'success'|'fail'){
 must(config().demo&&p.provider==='mock','Test payment is disabled.',403);
 if(result==='fail'){await failPackPayment(p.id);return false;}
 if(p.status==='failed')await run("UPDATE credit_purchases SET status='pending' WHERE id=? AND status='failed'",p.id);
 return confirmPackPayment(p.id,p.provider_session_id,'test_payment_'+p.id,p.amount,p.currency);
}
export async function listPurchases(userId:string|null,url:URL){
 const {page,limit,offset}=pageQuery(url,25);
 const where=userId?' WHERE p.user_id=?':'',args=userId?[userId]:[];
 const count=await one('SELECT COUNT(*) AS total FROM credit_purchases p'+where,...args);
 const rows=await all('SELECT p.*,u.email FROM credit_purchases p LEFT JOIN users u ON u.id=p.user_id'+where+' ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?',...args,limit,offset);
 const total=Number(count?.total||0);
 return {purchases:rows.map(r=>({...publicPurchase(r),...(userId?{}:{email:r.email})})),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}};
}
export {publicPurchase};
