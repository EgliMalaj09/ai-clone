// Credit packs and their purchases. Payment confirmation grants the pack's credits in the same atomic credit
// transaction that marks the purchase paid, so a retried or concurrent webhook can never grant twice.
import {z} from 'zod';
import {all,audit,config,event,HttpError,must,now,one,parse,run,stmt,uid,type Row} from './data';
import {purchaseReadiness,maintenanceStatus,DEFAULT_MAINTENANCE_MESSAGE} from './connections';
import {pageQuery} from './http';
import {createPokOrder,getPokOrder,pokCurrencies,pokOrderState} from './payments';
import {available,onlyIfApplied,post,SYSTEM} from './credits';
import type {StudioUser} from '../contracts';
import {reportError} from './errors';
import {checkoutDiscount,recordDiscountUse,rewardReferral} from './promos';

export const packCurrencies=pokCurrencies;
export const packageSchema=z.object({
 name:z.string().trim().min(2).max(60),credits:z.number().int().min(1).max(1000000),bonusCredits:z.number().int().min(0).max(1000000).default(0),
 prices:z.record(z.enum(packCurrencies),z.number().int().min(50).max(100000000)).refine(p=>Object.keys(p).length>0,'Add at least one price.').refine(p=>!p.ALL||p.ALL%100===0,'Prices in ALL must be whole lek.'),
 active:z.boolean(),sortOrder:z.number().int().min(0).max(1000).default(0),
});
// Packs saved before POK may carry prices in currencies POK cannot charge; those are hidden.
const supportedPrices=(prices:Record<string,number>)=>Object.fromEntries(Object.entries(prices).filter(([c])=>(packCurrencies as readonly string[]).includes(c)));
const purchasePath=(id:string)=>'/credits?purchase='+id;
const publicPackage=(p:Row)=>({id:p.id as string,name:p.name as string,credits:Number(p.credits),bonusCredits:Number(p.bonus_credits),totalCredits:Number(p.credits)+Number(p.bonus_credits),prices:supportedPrices(parse<Record<string,number>>(p.prices,{})),active:!!p.active,sortOrder:Number(p.sort_order)});
const publicPurchase=(p:Row)=>({id:p.id,packageName:p.package_name,credits:p.credits,amount:p.amount,currency:p.currency,status:p.status,provider:p.provider,createdAt:p.created_at,paidAt:p.paid_at,gift:p.gift_email?{email:p.gift_email as string,name:p.gift_name as string}:null});

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
 const b=z.object({packageId:z.string().max(100),currency:z.enum(packCurrencies),idempotencyKey:z.string().uuid(),consent:z.literal(true),promoCode:z.string().max(40).optional(),gift:z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),name:z.string().trim().min(1).max(80),message:z.string().trim().max(500).default('')}).optional()}).parse(input);
 must(user.emailVerified,'Verify your email before buying credits.',403);
 const prior=await one('SELECT * FROM credit_purchases WHERE user_id=? AND idempotency_key=?',user.id,b.idempotencyKey);
 if(prior){must(prior.package_id===b.packageId&&prior.currency===b.currency,'This checkout key was already used for another purchase.',409);return {purchaseId:prior.id,...await ensurePackCheckout(prior,user.email)};}
 const pack=await one('SELECT * FROM credit_packages WHERE id=? AND active=1',b.packageId);must(pack,'This credit pack is not available.',404);
 const fullAmount=supportedPrices(parse<Record<string,number>>(pack.prices,{}))[b.currency];must(Number.isSafeInteger(fullAmount)&&fullAmount>0,'This pack is not sold in that currency.',400);
 // V4: a discount code lowers the price of this purchase; it counts as used when the payment is confirmed.
 const promo=await checkoutDiscount(user,b.promoCode,fullAmount,b.currency);const amount=promo?.amount??fullAmount;
 const maint=await maintenanceStatus();must(!maint.purchasesPaused,maint.message||DEFAULT_MAINTENANCE_MESSAGE,503);
 if(!config().demo)must((await purchaseReadiness()).ready,'Buying credits is not open yet. Please check back soon.',503);
 const id=uid('cp_');
 try{await run('INSERT INTO credit_purchases (id,user_id,package_id,package_name,credits,amount,currency,status,provider,idempotency_key,created_at,promo_code,full_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user.id,pack.id,pack.name,Number(pack.credits)+Number(pack.bonus_credits),amount,b.currency,'pending',config().demo?'mock':'pok',b.idempotencyKey,now(),promo?.code??null,promo?fullAmount:null);
  if(b.gift)await run('UPDATE credit_purchases SET gift_email=?,gift_name=?,gift_message=? WHERE id=?',b.gift.email,b.gift.name,b.gift.message,id);}
 catch(e){const duplicate=await one('SELECT * FROM credit_purchases WHERE user_id=? AND idempotency_key=?',user.id,b.idempotencyKey);if(duplicate)return {purchaseId:duplicate.id,...await ensurePackCheckout(duplicate,user.email)};throw e}
 await event('credits_checkout_started',user.id,{purchaseId:id});
 return {purchaseId:id,...await ensurePackCheckout((await one('SELECT * FROM credit_purchases WHERE id=?',id))!,user.email)};
}

/** Returns a checkout URL for the purchase, reusing an open POK order and replacing an expired one. */
export async function ensurePackCheckout(purchase:Row,_email:string,retry=false){
 let p=purchase;
 must(config().demo||p.provider!=='mock','This test purchase cannot be paid in production.',403);
 if(['paid','reversed'].includes(p.status))return {url:purchasePath(p.id)};
 if(retry&&p.provider==='pok'&&p.provider_session_id){
  const state=pokOrderState(await getPokOrder(p.provider_session_id),p);
  if(state==='paid'){await confirmPackPayment(p.id,p.provider_session_id,p.provider_session_id,p.amount,p.currency);return {url:purchasePath(p.id)};}
  must(state!=='mismatch','This payment needs review. Please contact support.',409);
  if(state==='expired'){
   await run("UPDATE credit_purchases SET provider_session_id=NULL,checkout_url=NULL,checkout_attempt=checkout_attempt+1,status='pending' WHERE id=? AND provider_session_id=? AND status IN ('pending','failed')",p.id,p.provider_session_id);
   p=(await one('SELECT * FROM credit_purchases WHERE id=?',p.id))!;
  }
 }
 if(retry&&p.status==='failed'){await run("UPDATE credit_purchases SET status='pending' WHERE id=? AND status='failed'",p.id);}
 if(p.checkout_url)return {url:p.checkout_url as string};
 const session=p.provider==='mock'?{id:'test_'+p.id,url:'/credits/checkout/'+p.id}
  :await createPokOrder({id:p.id,amount:p.amount,currency:p.currency,name:`${p.package_name} · ${p.credits} credits`,successPath:purchasePath(p.id)+'&returned=1',cancelPath:'/credits?cancelled=1'});
 await run("UPDATE credit_purchases SET provider_session_id=?,checkout_url=? WHERE id=? AND provider_session_id IS NULL AND checkout_attempt=? AND status IN ('pending','failed')",session.id,session.url,p.id,p.checkout_attempt);
 const saved=await one('SELECT provider_session_id,checkout_url FROM credit_purchases WHERE id=?',p.id);
 // A concurrent request saved its order first; use that one and let this order expire unused.
 must(saved?.checkout_url,'Checkout changed. Please refresh and try again.',409);
 return {url:saved.checkout_url as string};
}

/** Marks the purchase paid and grants its credits in one transaction; returns false if nothing changed. */
export async function confirmPackPayment(purchaseId:string,sessionId:string,transactionId:string,amount:number,currency:string){
 const p=await one('SELECT * FROM credit_purchases WHERE id=?',purchaseId);
 must(p,'Credit purchase not found.',404);
 must(p.provider_session_id===sessionId&&p.amount===amount&&typeof currency==='string'&&p.currency.toLowerCase()===currency.toLowerCase()&&typeof transactionId==='string','Payment details did not match the purchase.',400);
 if(!p.user_id){
  await run("UPDATE credit_purchases SET status='paid',provider_transaction_id=?,paid_at=? WHERE id=? AND status IN ('pending','failed')",transactionId,now(),p.id);
  await reportError('payment','Paid credit purchase has no account and needs review',{context:{purchaseId:p.id as string}});return false;
 }
 // Only an open purchase can be paid: a reversed purchase must never be granted again.
 if(p.gift_email)return confirmGiftPayment(p,transactionId);
 const open={sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status IN ('pending','failed'))",args:[p.id]};
 const result=await post({kind:'purchase',key:'purchase:'+p.id,userId:p.user_id,referenceType:'credit_purchase',referenceId:p.id,reason:p.package_name,condition:open,
  moves:[{account:SYSTEM.issued,amount:-p.credits},{account:available(p.user_id),amount:p.credits}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='paid',provider_transaction_id=?,paid_at=? WHERE id=? AND status IN ('pending','failed') AND ${g.sql}`,transactionId,now(),p.id,...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(result?.applied){await event('credits_purchased',p.user_id,{purchaseId:p.id,credits:p.credits});await sendReceipt(p,transactionId);await recordDiscountUse({id:p.id as string,user_id:p.user_id as string,promo_code:(p.promo_code as string|null)??null});await rewardReferral(p.user_id as string);}
 return !!result?.applied;
}
export async function failPackPayment(purchaseId:string,sessionId?:string){
 const r=await run("UPDATE credit_purchases SET status='failed' WHERE id=? AND status='pending'"+(sessionId?' AND provider_session_id=?':''),purchaseId,...(sessionId?[sessionId]:[]));
 if(r.meta.changes)await event('credits_payment_failed',null,{purchaseId});
}
/** A reversed payment (a refund or chargeback made in POK) removes the purchased credits, even if that takes the balance below zero. */
export async function reversePackPayment(purchaseId:string,reason:string,actorId?:string){
 const p=await one('SELECT * FROM credit_purchases WHERE id=?',purchaseId);
 if(!p||p.status!=='paid')return false;
 if(!p.user_id){await run("UPDATE credit_purchases SET status='reversed' WHERE id=? AND status='paid'",p.id);return false;}
 if(p.gift_email)return reverseGiftPayment(p,reason,actorId);
 const result=await post({kind:'reversal',key:'reversal:'+p.id,userId:p.user_id,actorId,referenceType:'credit_purchase',referenceId:p.id,reason,allowNegative:true,
  condition:{sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status='paid')",args:[p.id]},
  moves:[{account:available(p.user_id),amount:-p.credits},{account:SYSTEM.refunded,amount:p.credits}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='reversed' WHERE id=? AND status='paid' AND ${g.sql}`,p.id,...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(result?.applied){await reportError('payment','Credit purchase payment reversed; review the account',{level:'warning',context:{purchaseId:p.id as string,userId:p.user_id as string}});await event('credits_payment_reversed',p.user_id,{purchaseId:p.id});}
 return !!result?.applied;
}

export async function purchaseFor(userId:string,id:string){const p=await one('SELECT * FROM credit_purchases WHERE id=? AND user_id=?',id,userId);must(p,'Purchase not found.',404);return p;}
/** Asks POK for the order's state; the only path that grants credits for a POK purchase. */
export async function verifyPackCheckout(p:Row){
 if(p.provider!=='pok'||['paid','reversed'].includes(p.status))return;
 must(p.provider_session_id,'Checkout is not ready.',409);
 const state=pokOrderState(await getPokOrder(p.provider_session_id),p);
 if(state==='paid')await confirmPackPayment(p.id,p.provider_session_id,p.provider_session_id,p.amount,p.currency);
 else if(state==='expired')await failPackPayment(p.id,p.provider_session_id);
 else if(state==='mismatch')await reportError('webhook','POK order does not match the purchase; review it',{context:{purchaseId:p.id as string}});
}
/** Re-checks recent unpaid POK purchases, in case a webhook never arrived. Runs with the hourly maintenance and the dispatcher. */
export async function sweepPendingPurchases(){
 const t=now();
 for(const p of await all("SELECT * FROM credit_purchases WHERE provider='pok' AND status='pending' AND provider_session_id IS NOT NULL AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 20",t-86400000,t-60000)){
  try{await verifyPackCheckout(p)}catch(e){await reportError('payment','Pending purchase check failed',{error:e,context:{purchaseId:p.id as string}})}
 }
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

// Gifts (V28): a paid gift pack moves its credits into a holding account and becomes a one-time code emailed to the
// recipient; redeeming the code moves them to the recipient. A reversed gift cancels an unused code, or takes the
// credits back from whoever redeemed it.
async function confirmGiftPayment(p:Row,transactionId:string){
 const open={sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status IN ('pending','failed'))",args:[p.id]};
 const code='GIFT-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
 const result=await post({kind:'gift_sale',key:'purchase:'+p.id,userId:p.user_id,referenceType:'credit_purchase',referenceId:p.id,reason:'Gift for '+p.gift_name,condition:open,
  moves:[{account:SYSTEM.issued,amount:-p.credits},{account:SYSTEM.gifts,amount:p.credits}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='paid',provider_transaction_id=?,paid_at=?,gift_code=? WHERE id=? AND status IN ('pending','failed') AND ${g.sql}`,transactionId,now(),code,p.id,...g.args),
   stmt(`INSERT INTO promo_codes (id,code,kind,credits,max_uses,note,created_by,created_at) SELECT ?,?,'gift',?,1,?,?,? WHERE ${g.sql}`,uid('promo_'),code,p.credits,'Gift from purchase '+p.id,p.user_id,now(),...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(!result?.applied)return false;
 await event('gift_purchased',p.user_id,{purchaseId:p.id,credits:p.credits});
 await recordDiscountUse({id:p.id as string,user_id:p.user_id as string,promo_code:(p.promo_code as string|null)??null});
 try{
  const {sendMail}=await import('./security');const {noticeMailContent}=await import('./email-templates');const {serviceConfig}=await import('./connections');const c=await serviceConfig();
  const buyer=await one('SELECT name,email,locale FROM users WHERE id=?',p.user_id);const lang=buyer?.locale==='en'?'en':'sq';
  const link=`${c.origin}/register?next=${encodeURIComponent('/credits?code='+code)}`;
  await sendMail(p.gift_email as string,noticeMailContent({lang,brand:c.brandName,subject:'{from} sent you a {brand} gift',heading:'You received {amount}',lead:(p.gift_message?'“{message}” — {from}\n\n':'')+'Use them to turn a photo of yourself into an AI video. Your gift code is {code}. Sign in or create an account and redeem it under Credits.',vars:{from:(buyer?.name as string)||'A friend',amount:`${p.credits} ${lang==='sq'?'kredite':'credits'}`,message:(p.gift_message as string)||'',code},link,linkLabel:'Redeem your gift',supportEmail:c.mailFrom}),'gift-'+p.id);
  if(buyer)await sendMail(buyer.email as string,noticeMailContent({lang,brand:c.brandName,subject:'Your gift is on its way',heading:'Your gift was sent',lead:'We emailed {name} ({email}) a code for {amount}. If it doesn’t arrive, you can share this code yourself: {code}',vars:{name:p.gift_name as string,email:p.gift_email as string,amount:`${p.credits} ${lang==='sq'?'kredite':'credits'}`,code},supportEmail:c.mailFrom}),'gift-buyer-'+p.id);
 }catch(e){await reportError('email','Gift email needs a retry',{error:e,context:{purchaseId:p.id as string}});}
 return true;
}
async function reverseGiftPayment(p:Row,reason:string,actorId?:string){
 const code=await one('SELECT id,uses FROM promo_codes WHERE code=?',p.gift_code);
 if(code)await run('UPDATE promo_codes SET active=0 WHERE id=?',code.id);
 const redemption=code?await one('SELECT user_id FROM promo_redemptions WHERE code_id=?',code.id):null;
 const back=redemption?.user_id?{userId:redemption.user_id as string,moves:[{account:available(redemption.user_id as string),amount:-p.credits},{account:SYSTEM.refunded,amount:p.credits}]}:{userId:p.user_id as string,moves:[{account:SYSTEM.gifts,amount:-p.credits},{account:SYSTEM.refunded,amount:p.credits}]};
 const result=await post({kind:'reversal',key:'reversal:'+p.id,userId:back.userId,actorId,referenceType:'credit_purchase',referenceId:p.id,reason,allowNegative:true,
  condition:{sql:"EXISTS (SELECT 1 FROM credit_purchases WHERE id=? AND status='paid')",args:[p.id]},moves:back.moves,
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_purchases SET status='reversed' WHERE id=? AND status='paid' AND ${g.sql}`,p.id,...g.args)];}})
  .catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 if(result?.applied)await reportError('payment','Gift purchase reversed; its code was cancelled',{level:'warning',context:{purchaseId:p.id as string,redeemedBy:(redemption?.user_id as string|undefined)??null}});
 return !!result?.applied;
}

/** Receipt email after a paid purchase (C11.1), in the customer's language. Not a fiscal invoice (see D8). */
async function sendReceipt(p:Row,transactionId:string){
 try{
  const u=await one('SELECT email,locale FROM users WHERE id=?',p.user_id);if(!u)return;
  const {sendMail}=await import('./security');const {noticeMailContent}=await import('./email-templates');const {serviceConfig}=await import('./connections');const {money}=await import('../contracts');const c=await serviceConfig();const lang=u.locale==='en'?'en':'sq';
  const lines=[`${p.package_name}: ${p.credits} ${lang==='sq'?'kredite':'credits'}`,`${money(Number(p.amount),p.currency as string)}${p.full_amount?` (${money(Number(p.full_amount),p.currency as string)} − ${p.promo_code})`:''}`,`ID: ${String(p.id).slice(-10).toUpperCase()} · ${transactionId}`].join(' · ');
  await sendMail(u.email as string,noticeMailContent({lang,brand:c.brandName,subject:'Your {brand} receipt',heading:'Thank you for your purchase',lead:'Your credits are in your account. {lines}. This receipt is not a tax invoice.',vars:{lines},link:c.origin+'/credits',linkLabel:'See my credits',supportEmail:c.mailFrom}),'receipt-'+p.id);
 }catch(e){await reportError('email','Receipt email needs review',{error:e,context:{purchaseId:p.id as string}});}
}
