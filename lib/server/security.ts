import {serviceConfig} from './connections';
import {authMailContent} from './email-templates';
import {batch,config,must,now,one,run,stmt,type Row} from './data';
import type {StudioUser} from '../contracts';
import {reportError} from './errors';
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b)).map(n=>n.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
// Raise this to strengthen new hashes later; existing hashes keep verifying because the count is stored in the hash (F16).
export const PBKDF2_ITERATIONS=100000;
export async function passwordHash(password:string,salt=randomToken(),iterations=PBKDF2_ITERATIONS){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},key,256);return `pbkdf2$${iterations}$${salt}$${hex(bits)}`;}
export function constantEqual(a:string,b:string){let result=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)result|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return result===0;}
export async function checkPassword(password:string,value:string){const p=value.split('$');if(p.length!==4)return false;const iterations=Number(p[1]);if(!Number.isInteger(iterations)||iterations<1||iterations>10000000)return false;return constantEqual(await passwordHash(password,p[2],iterations),value);}
export async function sign(value:string){must(config().secret.length>=32,'Studio secret is not configured',503);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config().secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));}
export const safeUser=(u:Row):StudioUser=>({id:u.id,name:u.name,email:u.email,role:u.role,status:u.status,createdAt:u.created_at,avatar:u.avatar,emailVerified:!!u.email_verified,contentStrikes:Number(u.content_strikes||0),blocked:!!u.blocked_at,twoFactor:!!u.totp_enabled_at,locale:u.locale==='en'?'en':'sq'});
export async function getUser(h:Headers):Promise<StudioUser|null>{const token=h.get('cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1];if(!token)return null;const u=await one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',await hash(token),now());return u&&u.status==='active'?safeUser(u):null;}
export async function requireUser(h:Headers,admin=false){const u=await getUser(h);must(u,'Please sign in to continue.',401);must(!admin||u.role==='admin','Administrator access is required.',403);return u;}
export async function sessionCookie(userId:string,request:Request){const token=randomToken();await run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',await hash(token),userId,now()+7*86400000);return `studio_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function clearCookie(request:Request){return `studio_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function rateLimit(key:string,max=30,windowMs=60000){const n=now();const r=await one('INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END RETURNING count',key,n+windowMs,n,n,n+windowMs);must(r&&r.count<=max,'Too many requests. Please try again shortly.',429);}
export function protectOrigin(req:Request){if(['GET','HEAD','OPTIONS'].includes(req.method))return;const origin=req.headers.get('origin');if(origin){const allowed=[new URL(req.url).origin,config().origin];must(allowed.includes(origin),'This request came from an untrusted origin.',403);}const site=req.headers.get('sec-fetch-site');must(site!=='cross-site','Cross-site requests are not allowed.',403);// Only a session cookie makes this a signed-in action; the language cookie alone does not.
 if(/(?:^|;\s*)studio_session=/.test(req.headers.get('cookie')||''))must(origin||site==='same-origin','An origin is required for a signed-in action.',403);}
export async function sendAuthMail(email:string,token:string,type:'verify'|'reset',lang:'sq'|'en'='sq'){const c=await serviceConfig();const url=`${c.origin}/${type==='verify'?'verify':'reset-password'}?token=${token}`;if(c.demo&&!c.mailKey)return null;must(c.mailKey&&c.mailFrom,'Email delivery is not configured. Contact the studio owner.',503);const mail=authMailContent(type,{brand:c.brandName,url,supportEmail:c.mailFrom,lang});const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${c.mailKey}`,'Content-Type':'application/json','Idempotency-Key':'auth-'+await hash(token)},signal:AbortSignal.timeout(12000),body:JSON.stringify({from:c.mailFrom,to:email,subject:mail.subject,html:mail.html,text:mail.text})});must(result.ok,'We could not send the email. Please try again.',503);return null;}
/** Best-effort transactional email (e.g. report decisions). Returns false when mail is not configured; never throws on a send failure. */
export async function sendMail(to:string,mail:{subject:string;html:string;text:string},idempotencyKey?:string){
 const c=await serviceConfig();
 if(!c.mailKey||!c.mailFrom)return false;
 try{
  const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${c.mailKey}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},signal:AbortSignal.timeout(12000),body:JSON.stringify({from:c.mailFrom,to,subject:mail.subject,html:mail.html,text:mail.text})});
  if(!result.ok)await reportError('email','Email provider rejected a message',{context:{status:result.status,idempotencyKey}});
  return result.ok;
 }catch(e){await reportError('email','Transactional email failed',{error:e,context:{idempotencyKey}});return false;}
}
export async function makeAuthToken(userId:string,type:string){const token=randomToken();await batch([stmt('DELETE FROM auth_tokens WHERE user_id=? AND type=?',userId,type),stmt('INSERT INTO auth_tokens (token_hash,user_id,type,expires_at) VALUES (?,?,?,?)',await hash(token),userId,type,now()+1800000)]);return token;}
