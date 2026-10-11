import {z} from 'zod';
import {audit,batch,config,HttpError,must,now,one,run,stmt,type Row} from './data';
import {jsonBody} from './http';
import {checkPassword,hash,randomToken,rateLimit,sessionCookie} from './security';
import type {StudioUser} from '../contracts';

// Two-step sign-in with an authenticator app (C4.1): TOTP (RFC 6238, SHA-1, 6 digits, 30 s), as used by
// Google Authenticator, Microsoft Authenticator, 1Password and others. The secret is stored encrypted; each code
// works once; eight one-time recovery codes cover a lost phone.

const encoder=new TextEncoder();
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes:Uint8Array){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=ALPHABET[(value<<(5-bits))&31];return out;}
export function base32Decode(text:string){const clean=text.toUpperCase().replace(/[^A-Z2-7]/g,'');let bits=0,value=0;const out:number[]=[];for(const c of clean){value=(value<<5)|ALPHABET.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return new Uint8Array(out);}

/** The 6-digit code for one 30-second step. */
export async function totpCode(secret:Uint8Array<ArrayBuffer>,step:number){
 const counter=new Uint8Array(8);let n=step;for(let i=7;i>=0;i--){counter[i]=n&255;n=Math.floor(n/256);}
 const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));const o=mac[19]&15;
 const bin=((mac[o]&127)<<24)|(mac[o+1]<<16)|(mac[o+2]<<8)|mac[o+3];
 return String(bin%1000000).padStart(6,'0');
}
const currentStep=()=>Math.floor(now()/30000);
/** Accepts the code for this step or one step either side (clock drift), never a step already used. Returns the step. */
async function matchStep(secret:Uint8Array<ArrayBuffer>,code:string,lastStep:number){
 if(!/^\d{6}$/.test(code))return null;
 const s=currentStep();for(const step of [s,s-1,s+1])if(step>lastStep&&await totpCode(secret,step)===code)return step;
 return null;
}

async function secretKey(){
 must(config().secret.length>=32,'Configure the application signing key first.',503);
 const source=await crypto.subtle.importKey('raw',encoder.encode(config().secret),'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('project-studio/totp/v1'),info:encoder.encode('AES-256-GCM')},source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const b64=(b:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function seal(userId:string,secret:Uint8Array<ArrayBuffer>){const iv=crypto.getRandomValues(new Uint8Array(12));return JSON.stringify({v:1,iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(userId)},await secretKey(),secret))});}
async function unseal(userId:string,value:string){try{const r=JSON.parse(value);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(r.iv),additionalData:encoder.encode(userId)},await secretKey(),unb64(r.data)));}catch{throw new HttpError(503,'Two-step sign-in could not be unlocked. Use a recovery code or contact the studio owner.');}}

const recoveryCode=()=>{const t=randomToken().slice(0,10).toUpperCase();return t.slice(0,5)+'-'+t.slice(5);};
const normalizeRecovery=(c:string)=>c.toUpperCase().replace(/[^0-9A-F]/g,'');

/** Checks a 6-digit code or a recovery code for an account; consumes it on success. */
export async function verifySecondFactor(u:Row,code:string){
 const value=code.trim();
 if(/^\d{6}$/.test(value)){
  const step=await matchStep(await unseal(u.id,u.totp_secret),value,Number(u.totp_last_step||0));if(step===null)return false;
  // Conditional update: two requests racing with the same code cannot both succeed.
  return !!(await one('UPDATE users SET totp_last_step=? WHERE id=? AND totp_last_step<? RETURNING id',step,u.id,step));
 }
 const codes=JSON.parse(u.totp_recovery||'[]') as string[];const h=await hash(normalizeRecovery(value));
 if(!codes.includes(h))return false;
 return !!(await one('UPDATE users SET totp_recovery=? WHERE id=? AND totp_recovery=? RETURNING id',JSON.stringify(codes.filter(c=>c!==h)),u.id,u.totp_recovery));
}

/** After a correct password: accounts with two-step sign-in get a 5-minute ticket instead of a session. */
export async function startSecondStep(userId:string){
 const ticket=randomToken();
 await batch([stmt("DELETE FROM auth_tokens WHERE user_id=? AND type='mfa'",userId),stmt("INSERT INTO auth_tokens (token_hash,user_id,type,expires_at) VALUES (?,?,'mfa',?)",await hash(ticket),userId,now()+300000)]);
 return ticket;
}
/** Second step of sign-in: the ticket plus a code (or recovery code) opens a session. */
export async function finishSecondStep(req:Request,input:unknown){
 const b=z.object({ticket:z.string().min(32).max(100),code:z.string().trim().min(6).max(20)}).parse(input);
 const ticketHash=await hash(b.ticket);await rateLimit('mfa:'+ticketHash,5,300000);
 const t=await one("SELECT user_id FROM auth_tokens WHERE token_hash=? AND type='mfa' AND expires_at>?",ticketHash,now());must(t,'This sign-in has expired. Enter your email and password again.',400);
 const u=await one('SELECT * FROM users WHERE id=?',t.user_id);must(u&&u.status==='active'&&u.totp_enabled_at,'This sign-in has expired. Enter your email and password again.',400);
 await rateLimit('mfa-user:'+u.id,10,900000);
 must(await verifySecondFactor(u,b.code),'That code is not right. Use the latest 6-digit code from your authenticator app, or a recovery code.',401);
 await run("DELETE FROM auth_tokens WHERE token_hash=?",ticketHash);
 await audit(u.id,'account.signed-in-2fa',u.id);
 return {user:u,cookie:await sessionCookie(u.id,req)};
}

/** Account → Two-step sign-in: status, set up, turn on, turn off, new recovery codes. */
export async function mfaAPI(req:Request,path:string[],user:StudioUser){
 await rateLimit('account-mfa:'+user.id,20,900000);
 const u=await one('SELECT * FROM users WHERE id=?',user.id);must(u,'Account not found.',404);
 const action=path[2]||'';
 if(req.method==='GET'&&!action)return {enabled:!!u.totp_enabled_at,enabledAt:u.totp_enabled_at??null,recoveryCodesLeft:(JSON.parse(u.totp_recovery||'[]') as string[]).length};
 must(req.method==='POST','Two-step sign-in action not found.',404);
 const b=await jsonBody(req);
 const password=async()=>{const p=z.string().min(1).max(128).parse(b.password);must(u.password_hash&&await checkPassword(p,u.password_hash),'Your password is incorrect.',403);};
 if(action==='setup'){
  must(!u.totp_enabled_at,'Two-step sign-in is already on.',409);await password();
  const secret=crypto.getRandomValues(new Uint8Array(20));await run('UPDATE users SET totp_pending=? WHERE id=?',await seal(u.id,secret),u.id);
  const key=base32Encode(secret),issuer=(config().brandName||'Studio').replace(/[:]/g,'');
  return {secret:key.replace(/(.{4})/g,'$1 ').trim(),uri:`otpauth://totp/${encodeURIComponent(issuer+':'+u.email)}?secret=${key}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`};
 }
 if(action==='enable'){
  must(!u.totp_enabled_at,'Two-step sign-in is already on.',409);must(u.totp_pending,'Start the setup again.',409);
  const code=z.string().trim().regex(/^\d{6}$/,'Enter the 6-digit code from your app.').parse(b.code);
  const secret=await unseal(u.id,u.totp_pending),step=await matchStep(secret,code,0);
  must(step!==null,'That code is not right. Check the time on your phone and try the newest code.',400);
  const codes=Array.from({length:8},recoveryCode);
  await run('UPDATE users SET totp_secret=totp_pending,totp_pending=NULL,totp_enabled_at=?,totp_last_step=?,totp_recovery=? WHERE id=?',now(),step,JSON.stringify(await Promise.all(codes.map(c=>hash(normalizeRecovery(c))))),u.id);
  // Other browsers signed in with the password alone are signed out.
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1]||'';await run('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',u.id,await hash(token));
  await audit(u.id,'account.2fa-enabled',u.id);
  return {enabled:true,recoveryCodes:codes};
 }
 if(action==='disable'||action==='recovery'){
  must(u.totp_enabled_at,'Two-step sign-in is off.',409);await password();
  must(await verifySecondFactor(u,z.string().trim().min(6).max(20).parse(b.code)),'That code is not right.',400);
  if(action==='disable'){await run("UPDATE users SET totp_secret=NULL,totp_pending=NULL,totp_enabled_at=NULL,totp_recovery='[]' WHERE id=?",u.id);await audit(u.id,'account.2fa-disabled',u.id);return {enabled:false};}
  const codes=Array.from({length:8},recoveryCode);
  await run('UPDATE users SET totp_recovery=? WHERE id=?',JSON.stringify(await Promise.all(codes.map(c=>hash(normalizeRecovery(c))))),u.id);await audit(u.id,'account.2fa-recovery-codes',u.id);
  return {enabled:true,recoveryCodes:codes};
 }
 throw new HttpError(404,'Two-step sign-in action not found.');
}
