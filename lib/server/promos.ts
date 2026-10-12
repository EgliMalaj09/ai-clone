import {z} from 'zod';
import {all,audit,config,event,HttpError,must,now,one,run,uid} from './data';
import {grant,SYSTEM} from './credits';
import {rateLimit} from './security';
import {reportError} from './errors';
import type {StudioUser} from '../contracts';

// Promo codes and referrals (V4).
// A credits code adds credits once per customer. A discount code takes a percentage off a credit pack at checkout and
// counts as used when that payment is confirmed. A referral rewards both customers once, after the invited customer's
// first paid purchase, with the credits set in Admin → Promo codes (0 turns referrals off).

const normalize=(code:string)=>code.trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');
async function findCode(raw:string,userId?:string){
 const code=normalize(raw);must(code.length>=3,'Enter a valid code.');
 const c=await one('SELECT * FROM promo_codes WHERE code=?',code);
 if(c&&userId)must(!await used(c.id as string,userId),'You have already used this code.',409);
 must(c&&c.active&&(!c.expires_at||Number(c.expires_at)>now())&&(c.max_uses===null||Number(c.uses)<Number(c.max_uses)),'This code is not valid or has expired.',404);
 return c;
}
async function used(codeId:string,userId:string){return !!await one('SELECT id FROM promo_redemptions WHERE code_id=? AND user_id=?',codeId,userId);}

/** Redeem a credits code, or check a discount code (it is applied at checkout). */
export async function redeemCode(user:StudioUser,input:unknown){
 await rateLimit('promo:'+user.id,10,3600000);
 const c=await findCode(z.object({code:z.string().max(40)}).parse(input).code,user.id);
 if(c.kind==='discount')return {kind:'discount' as const,code:c.code as string,percent:Number(c.percent)};
 must(user.emailVerified,'Verify your email before using a code.',403);
 // Counted first, with the limit in the same statement, so a code can't be used more times than allowed.
 const claimed=await one('UPDATE promo_codes SET uses=uses+1 WHERE id=? AND (max_uses IS NULL OR uses<max_uses) RETURNING id',c.id);must(claimed,'This code is not valid or has expired.',404);
 try{await run('INSERT INTO promo_redemptions (id,code_id,user_id,created_at) VALUES (?,?,?,?)',uid('pr_'),c.id,user.id,now());}
 catch{await run('UPDATE promo_codes SET uses=uses-1 WHERE id=?',c.id);throw new HttpError(409,'You have already used this code.');}
 const r=await grant({userId:user.id,amount:Number(c.credits),kind:'promo',key:`promo:${c.id}:${user.id}`,source:SYSTEM.promo,referenceType:'promo_code',referenceId:c.id as string,reason:'Code '+c.code});
 await event('promo_redeemed',user.id,{code:c.code});
 return {kind:'credits' as const,code:c.code as string,credits:Number(c.credits),balance:{available:r.available,held:r.held}};
}

/** Price after a discount code: at least 0.50, and whole lek for ALL (POK charges lek as whole numbers). */
export function discounted(amount:number,percent:number,currency:string){const raw=amount*(100-percent)/100;const v=currency==='ALL'?Math.round(raw/100)*100:Math.round(raw);return Math.max(50,v);}
/** At checkout: validates the code for this customer and returns the discounted amount. */
export async function checkoutDiscount(user:StudioUser,raw:string|undefined,amount:number,currency:string){
 if(!raw)return null;const c=await findCode(raw,user.id);must(c.kind==='discount','This code adds credits. Redeem it under “Have a code?” instead.',409);
 return {code:c.code as string,amount:discounted(amount,Number(c.percent),currency)};
}
/** When a discounted purchase is paid, the code counts as used by that customer. */
export async function recordDiscountUse(purchase:{id:string;user_id:string;promo_code:string|null}){
 if(!purchase.promo_code)return;const c=await one('SELECT id FROM promo_codes WHERE code=?',purchase.promo_code);if(!c)return;
 const inserted=await one('INSERT OR IGNORE INTO promo_redemptions (id,code_id,user_id,purchase_id,created_at) VALUES (?,?,?,?,?) RETURNING id',uid('pr_'),c.id,purchase.user_id,purchase.id,now());
 if(inserted)await run('UPDATE promo_codes SET uses=uses+1 WHERE id=?',c.id);
}

// Referrals
export async function referralReward(){return Math.max(0,Math.floor(Number((await one("SELECT value FROM app_settings WHERE key='referral_credits'"))?.value)||0));}
const newCode=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(7));return Array.from(b,x=>a[x%a.length]).join('');};
export async function referralInfo(user:StudioUser){
 let row=await one('SELECT referral_code FROM users WHERE id=?',user.id);
 for(let i=0;!row?.referral_code&&i<5;i++){try{await run('UPDATE users SET referral_code=? WHERE id=? AND referral_code IS NULL',newCode(),user.id)}catch{/* code taken, try another */}row=await one('SELECT referral_code FROM users WHERE id=?',user.id);}
 const [reward,joined]=await Promise.all([referralReward(),one('SELECT COUNT(*) AS n FROM users WHERE referred_by=?',user.id)]);
 return {code:row?.referral_code as string,url:`${config().origin}/register?ref=${row?.referral_code}`,reward,invited:Number(joined?.n||0)};
}
/** At sign-up: remember who invited this customer (never themselves). */
export async function attachReferral(userId:string,code:string|undefined){
 if(!code)return;const inviter=await one('SELECT id FROM users WHERE referral_code=?',normalize(code));
 if(inviter&&inviter.id!==userId)await run('UPDATE users SET referred_by=? WHERE id=? AND referred_by IS NULL',inviter.id,userId);
}
/** After a paid purchase: the first one of an invited customer rewards both of them, once. */
export async function rewardReferral(userId:string){
 try{
  const reward=await referralReward();if(!reward)return;
  const u=await one("SELECT referred_by,(SELECT COUNT(*) FROM credit_purchases WHERE user_id=users.id AND status='paid') AS paid FROM users WHERE id=?",userId);
  if(!u?.referred_by||Number(u.paid)!==1)return;
  const inviter=await one("SELECT id FROM users WHERE id=? AND status='active'",u.referred_by);if(!inviter)return;
  for(const [who,reason] of [[userId,'Thanks for joining with an invite'],[inviter.id as string,'A friend you invited made their first purchase']] as const)
   await grant({userId:who,amount:reward,kind:'referral',key:`referral:${userId}:${who}`,source:SYSTEM.promo,referenceType:'user',referenceId:userId,reason});
  await event('referral_rewarded',userId,{inviter:inviter.id,credits:reward});
 }catch(e){await reportError('credits','Referral reward needs review',{error:e,context:{userId}});}
}

// Admin
const codeSchema=z.object({code:z.string().trim().min(3).max(30).transform(normalize).refine(v=>v.length>=3,'Use letters and numbers for the code.'),kind:z.enum(['credits','discount']),credits:z.number().int().min(0).max(100000).default(0),percent:z.number().int().min(0).max(90).default(0),maxUses:z.number().int().min(1).max(1000000).nullable().default(null),expiresAt:z.number().int().positive().nullable().default(null),note:z.string().trim().max(200).default('')})
 .refine(c=>c.kind==='credits'?c.credits>0:c.percent>0,{message:'Set the credits to give, or the percentage off (1–90).'});
export async function listCodes(){
 const rows=await all('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 200');
 return {referralCredits:await referralReward(),codes:rows.map(r=>({id:r.id as string,code:r.code as string,kind:r.kind as string,credits:Number(r.credits),percent:Number(r.percent),maxUses:r.max_uses===null?null:Number(r.max_uses),uses:Number(r.uses),expiresAt:(r.expires_at as number|null)??null,active:!!r.active,note:r.note as string,createdAt:r.created_at as number}))};
}
export async function createCode(admin:StudioUser,input:unknown){
 const b=codeSchema.parse(input);must(!await one('SELECT id FROM promo_codes WHERE code=?',b.code),'This code already exists.',409);
 const id=uid('promo_');await run('INSERT INTO promo_codes (id,code,kind,credits,percent,max_uses,expires_at,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',id,b.code,b.kind,b.kind==='credits'?b.credits:0,b.kind==='discount'?b.percent:0,b.maxUses,b.expiresAt,b.note,admin.id,now());
 await audit(admin.id,'promo.create',id);return {id};
}
export async function setCodeActive(admin:StudioUser,id:string,active:boolean){const r=await one('UPDATE promo_codes SET active=? WHERE id=? RETURNING id',active?1:0,id);must(r,'Code not found.',404);await audit(admin.id,active?'promo.enable':'promo.disable',id);return {ok:true};}
export async function setReferralCredits(admin:StudioUser,credits:number){must(Number.isInteger(credits)&&credits>=0&&credits<=100000,'Enter a whole number of credits.');await run("INSERT INTO app_settings (key,value) VALUES ('referral_credits',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(credits));await audit(admin.id,'settings.update','referral_credits');return {ok:true};}
