// The credits ledger. Every balance change is one transaction whose entries sum to zero, applied atomically in a
// D1 batch. Design: docs/CREDITS-ARCHITECTURE.md. No other module writes credit_balances, credit_transactions,
// credit_entries or credit_holds.
import {all,batch,HttpError,must,now,one,run,stmt,uid} from './data';
import {pageQuery} from './http';

export type CreditKind='purchase'|'welcome'|'adjust'|'goodwill'|'hold'|'capture'|'release'|'reversal';
export const available=(userId:string)=>`user:${userId}:available`;
export const held=(userId:string)=>`user:${userId}:held`;
export const SYSTEM={issued:'system:issued',promo:'system:promo',consumed:'system:consumed',refunded:'system:refunded'} as const;

type Move={account:string;amount:number};
type Condition={sql:string;args:unknown[]};
export type Posting={
 kind:CreditKind;key:string;userId:string;moves:Move[];
 referenceType?:string;referenceId?:string;actorId?:string;reason?:string;
 /** Extra requirement for the change, e.g. "this hold is still pending". */
 condition?:Condition;
 /** Statements that must happen only together with the change. Guard each with onlyIfApplied(transactionId). */
 extra?:(transactionId:string)=>D1PreparedStatement[];
 /** Chargebacks may take a balance below zero; nothing else may. */
 allowNegative?:boolean;
};
export type PostResult={applied:boolean;duplicate:boolean;transactionId:string;available:number;held:number};

/** SQL condition that is true only inside a batch whose credit transaction was written. */
export const onlyIfApplied=(transactionId:string):Condition=>({sql:'EXISTS (SELECT 1 FROM credit_transactions WHERE id=?)',args:[transactionId]});

export async function balanceOf(userId:string){
 const b=await one('SELECT available,held FROM credit_balances WHERE user_id=?',userId);
 return {available:Number(b?.available??0),held:Number(b?.held??0)};
}

/** Apply one balanced credit transaction exactly once per idempotency key. */
export async function post(p:Posting):Promise<PostResult>{
 must(p.moves.length>=2&&p.moves.every(m=>Number.isSafeInteger(m.amount)&&m.amount!==0),'Invalid credit transaction.',500);
 must(p.moves.reduce((n,m)=>n+m.amount,0)===0,'Unbalanced credit transaction.',500);
 const deltaAvailable=p.moves.filter(m=>m.account===available(p.userId)).reduce((n,m)=>n+m.amount,0);
 const deltaHeld=p.moves.filter(m=>m.account===held(p.userId)).reduce((n,m)=>n+m.amount,0);
 await run('INSERT OR IGNORE INTO credit_balances (user_id,available,held,version,updated_at) VALUES (?,0,0,0,?)',p.userId,now());
 for(let attempt=0;attempt<5;attempt++){
  const existing=await one('SELECT id FROM credit_transactions WHERE idempotency_key=?',p.key);
  if(existing)return {applied:false,duplicate:true,transactionId:existing.id,...await balanceOf(p.userId)};
  const b=await one('SELECT available,held,version FROM credit_balances WHERE user_id=?',p.userId);
  must(b,'Credit balance unavailable.',500);
  if(!p.allowNegative&&(b.available+deltaAvailable<0||b.held+deltaHeld<0))throw new HttpError(402,'Not enough credits.');
  const txId=uid('ctx_'),t=now();
  const funds=p.allowNegative?'':' AND available+?>=0 AND held+?>=0';
  const condition=p.condition?' AND '+p.condition.sql:'';
  const applied=onlyIfApplied(txId);
  const statements=[
   // Changes the balance only if nobody else changed it since it was read, funds suffice and the key is unused.
   stmt(`UPDATE credit_balances SET available=available+?,held=held+?,version=version+1,last_transaction_id=?,updated_at=? WHERE user_id=? AND version=?${funds} AND NOT EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key=?)${condition}`,
    deltaAvailable,deltaHeld,txId,t,p.userId,b.version,...(p.allowNegative?[]:[deltaAvailable,deltaHeld]),p.key,...(p.condition?.args||[])),
   stmt('INSERT INTO credit_transactions (id,kind,idempotency_key,user_id,reference_type,reference_id,actor_id,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM credit_balances WHERE user_id=? AND last_transaction_id=?)',
    txId,p.kind,p.key,p.userId,p.referenceType??null,p.referenceId??null,p.actorId??null,p.reason??null,t,p.userId,txId),
   ...p.moves.map(m=>stmt(`INSERT INTO credit_entries (id,transaction_id,account,amount,balance_after,created_at) SELECT ?,?,?,?,${m.account===available(p.userId)?'(SELECT available FROM credit_balances WHERE user_id=?)':m.account===held(p.userId)?'(SELECT held FROM credit_balances WHERE user_id=?)':'NULL'},? WHERE ${applied.sql}`,
    uid('cen_'),txId,m.account,m.amount,...(m.account===available(p.userId)||m.account===held(p.userId)?[p.userId]:[]),t,...applied.args)),
   ...(p.extra?.(txId)||[]),
  ];
  await batch(statements);
  if(await one('SELECT id FROM credit_transactions WHERE id=?',txId))return {applied:true,duplicate:false,transactionId:txId,...await balanceOf(p.userId)};
  if(p.condition&&!await one('SELECT 1 AS ok WHERE '+p.condition.sql,...p.condition.args))throw new HttpError(409,'This credit change no longer applies.');
  // Otherwise another change won the race for this balance: read again and retry.
 }
 throw new HttpError(409,'Your balance is changing. Please try again.');
}

/** Add credits to a user's available balance from a system account. */
export function grant(o:{userId:string;amount:number;kind:'purchase'|'welcome'|'adjust'|'goodwill';key:string;source:string;referenceType?:string;referenceId?:string;actorId?:string;reason?:string;extra?:Posting['extra']}){
 must(Number.isSafeInteger(o.amount)&&o.amount>0,'Credit amount must be positive.');
 return post({...o,moves:[{account:o.source,amount:-o.amount},{account:available(o.userId),amount:o.amount}]});
}

/** Admin correction or gift. Removals never take the balance below zero. */
export function adjust(o:{userId:string;amount:number;actorId:string;reason:string;key:string}){
 must(Number.isSafeInteger(o.amount)&&o.amount!==0,'Enter a whole number of credits other than zero.');
 if(o.amount>0)return grant({userId:o.userId,amount:o.amount,kind:'adjust',key:o.key,source:SYSTEM.promo,referenceType:'admin',referenceId:o.actorId,actorId:o.actorId,reason:o.reason});
 return post({kind:'adjust',key:o.key,userId:o.userId,referenceType:'admin',referenceId:o.actorId,actorId:o.actorId,reason:o.reason,
  moves:[{account:available(o.userId),amount:o.amount},{account:SYSTEM.promo,amount:-o.amount}]});
}

/** Welcome credits from the admin setting (0 by default), granted at most once per account. */
export async function grantWelcomeCredits(userId:string){
 const setting=await one("SELECT value FROM app_settings WHERE key='welcome_credits'");
 const amount=Math.max(0,Math.floor(Number(setting?.value)||0));
 if(!amount)return null;
 return grant({userId,amount,kind:'welcome',key:'welcome:'+userId,source:SYSTEM.promo,referenceType:'user',referenceId:userId,reason:'Welcome credits'});
}

/** Reserve credits for a generation. `extra` receives the hold id and transaction id for statements that must commit with it. */
export async function placeHold(o:{userId:string;amount:number;generationId:string;key:string;extra?:(holdId:string,transactionId:string)=>D1PreparedStatement[]}){
 must(Number.isSafeInteger(o.amount)&&o.amount>0,'Invalid credit cost.',500);
 const holdId=uid('hold_');
 const result=await post({kind:'hold',key:o.key,userId:o.userId,referenceType:'generation',referenceId:o.generationId,
  moves:[{account:available(o.userId),amount:-o.amount},{account:held(o.userId),amount:o.amount}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`INSERT INTO credit_holds (id,user_id,generation_id,amount,status,created_at) SELECT ?,?,?,?,'pending',? WHERE ${g.sql}`,holdId,o.userId,o.generationId,o.amount,now(),...g.args),...(o.extra?.(holdId,tx)||[])];}});
 return {...result,holdId:result.applied?holdId:(await one('SELECT id FROM credit_holds WHERE generation_id=?',o.generationId))?.id as string|undefined};
}

/** Charge a pending hold (video delivered) or return it (generation failed). Each hold settles once, either way. */
export async function settleHold(holdId:string,outcome:'capture'|'release'){
 const h=await one('SELECT * FROM credit_holds WHERE id=?',holdId);
 must(h,'Credit hold not found.',404);
 if(h.status!=='pending')return {applied:false,status:h.status as string};
 const pending:Condition={sql:"EXISTS (SELECT 1 FROM credit_holds WHERE id=? AND status='pending')",args:[holdId]};
 const result=await post({kind:outcome,key:'settle:'+holdId,userId:h.user_id,referenceType:'generation',referenceId:h.generation_id,condition:pending,
  moves:outcome==='capture'?[{account:held(h.user_id),amount:-h.amount},{account:SYSTEM.consumed,amount:h.amount}]:[{account:held(h.user_id),amount:-h.amount},{account:available(h.user_id),amount:h.amount}],
  extra:tx=>{const g=onlyIfApplied(tx);return [stmt(`UPDATE credit_holds SET status=?,settled_at=? WHERE id=? AND status='pending' AND ${g.sql}`,outcome==='capture'?'captured':'released',now(),holdId,...g.args)];}}).catch(e=>{if(e instanceof HttpError&&e.status===409)return null;throw e;});
 const after=await one('SELECT status FROM credit_holds WHERE id=?',holdId);
 return {applied:!!result?.applied,status:after?.status as string};
}

const changeColumns=`COALESCE(SUM(CASE WHEN e.account='user:'||t.user_id||':available' THEN e.amount END),0) AS available_change,
 COALESCE(SUM(CASE WHEN e.account='user:'||t.user_id||':held' THEN e.amount END),0) AS held_change,
 MAX(CASE WHEN e.account='user:'||t.user_id||':available' THEN e.balance_after END) AS available_after`;

/** One row per transaction, newest first, with the change to the user's available and held credits. */
export async function creditHistory(userId:string,url:URL){
 const {page,limit,offset}=pageQuery(url,25);
 const count=await one('SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id=?',userId);
 const rows=await all(`SELECT t.id,t.kind,t.reason,t.reference_type,t.reference_id,t.created_at,${changeColumns} FROM credit_transactions t JOIN credit_entries e ON e.transaction_id=t.id WHERE t.user_id=? GROUP BY t.id ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`,userId,limit,offset);
 const total=Number(count?.total||0);
 return {transactions:rows,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}};
}

const kinds=['purchase','welcome','adjust','goodwill','hold','capture','release','reversal'];
export async function creditLedger(url:URL){
 const {page,limit,offset}=pageQuery(url,50);
 const search=(url.searchParams.get('search')||'').trim().slice(0,150),kind=url.searchParams.get('kind')||'all';
 const where:string[]=[],args:unknown[]=[];
 if(kind!=='all'){must(kinds.includes(kind),'Unknown credit transaction type.');where.push('t.kind=?');args.push(kind);}
 if(search){const like='%'+search.replace(/[\\%_]/g,'\\$&')+'%';where.push("(u.email LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\' OR t.reference_id LIKE ? ESCAPE '\\')");args.push(like,like,like);}
 const filter=where.length?' WHERE '+where.join(' AND '):'';
 const count=await one('SELECT COUNT(*) AS total FROM credit_transactions t LEFT JOIN users u ON u.id=t.user_id'+filter,...args);
 const rows=await all(`SELECT t.id,t.kind,t.user_id,u.email,t.reason,t.reference_type,t.reference_id,t.actor_id,t.created_at,${changeColumns} FROM credit_transactions t LEFT JOIN users u ON u.id=t.user_id JOIN credit_entries e ON e.transaction_id=t.id${filter} GROUP BY t.id ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`,...args,limit,offset);
 const total=Number(count?.total||0);
 return {transactions:rows,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}};
}

/** Checks the ledger invariants of docs/CREDITS-ARCHITECTURE.md §5.3. */
export async function reconcileCredits(){
 const [total,unbalanced,mismatched,negative]=await Promise.all([
  one('SELECT COALESCE(SUM(amount),0) AS total FROM credit_entries'),
  all('SELECT transaction_id FROM credit_entries GROUP BY transaction_id HAVING SUM(amount)!=0 LIMIT 20'),
  all(`SELECT * FROM (SELECT b.user_id,b.available,b.held,
    (SELECT COALESCE(SUM(amount),0) FROM credit_entries WHERE account='user:'||b.user_id||':available') AS ledger_available,
    (SELECT COALESCE(SUM(amount),0) FROM credit_entries WHERE account='user:'||b.user_id||':held') AS ledger_held,
    (SELECT COALESCE(SUM(amount),0) FROM credit_holds WHERE user_id=b.user_id AND status='pending') AS pending_holds
   FROM credit_balances b) WHERE available!=ledger_available OR held!=ledger_held OR held!=pending_holds LIMIT 20`),
  all('SELECT user_id,available FROM credit_balances WHERE available<0 LIMIT 20'),
 ]);
 const ok=Number(total?.total)===0&&!unbalanced.length&&!mismatched.length;
 return {ok,total:Number(total?.total||0),unbalanced,mismatched,negative};
}
