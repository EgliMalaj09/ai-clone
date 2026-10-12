// Social sign-in (V1): "Continue with Google" and "Continue with Apple" alongside email/password.
// OpenID Connect Authorization Code flow. Google: exchange the code, then read the userinfo endpoint.
// Apple: exchange the code (the client secret is an ES256 JWT we sign with the .p8 key) and read the id_token
// claims. Both identities arrive over a direct TLS call to the provider's token endpoint in return for our code
// and secret, which is the trust anchor (the same model as Google's userinfo). The signed `state` plus a matching
// one-time cookie nonce prevent login CSRF. See DECISIONS.md.
import {HttpError,batch,now,one,run,stmt,uid} from './data';
import {oauthConfigured,serviceConfig} from './connections';
import {constantEqual,hash,randomToken,rateLimit,sessionCookie,sign} from './security';
import {grantWelcomeCredits} from './credits';
import {attachReferral} from './promos';
import {reportError} from './errors';
import {TERMS_VERSION} from '../contracts';
import {langFromCookie} from '../i18n';

export type OauthProvider='google'|'apple';
export const OAUTH_PROVIDERS:OauthProvider[]=['google','apple'];
const isProvider=(p:string):p is OauthProvider=>OAUTH_PROVIDERS.includes(p as OauthProvider);
/** Error codes the login page knows how to translate; anything else becomes a generic failure. */
class OauthError extends Error{constructor(public code:'cancelled'|'no_email'|'suspended'|'unavailable'|'failed'){super(code)}}

const enc=new TextEncoder();
const b64=(b:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(b)));
const b64url=(b:ArrayBuffer|Uint8Array)=>b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64urlJson=(o:unknown)=>b64url(enc.encode(JSON.stringify(o)));
const fromB64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const fromB64url=(s:string)=>fromB64(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));

/** A relative same-origin path, never an open redirect. */
function safePath(p:unknown){return typeof p==='string'&&/^\/[^/\\]/.test(p)&&!p.includes('\\')?p.slice(0,512):'/creations';}

async function makeState(provider:OauthProvider,next:string,ref:string){
  const nonce=randomToken();
  const data=b64urlJson({p:provider,n:nonce,x:now()+600000,r:next,f:ref});
  return {state:data+'.'+await sign(data),nonce};
}
async function readState(state:string){
  const [data,sig]=String(state).split('.');
  if(!data||!sig||!constantEqual(await sign(data),sig))throw new OauthError('failed');
  let payload;try{payload=JSON.parse(new TextDecoder().decode(fromB64url(data)))}catch{throw new OauthError('failed')}
  if(!payload||typeof payload.x!=='number'||payload.x<now())throw new OauthError('failed');
  return payload as {p:OauthProvider;n:string;r:string;f:string};
}

async function fetchJson(url:string,init:RequestInit){
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});
  const text=await r.text();let data:Record<string,unknown>={};try{data=JSON.parse(text)}catch{/* non-JSON */}
  if(!r.ok)throw new HttpError(502,'oauth-upstream:'+r.status);
  return data;
}

type Identity={sub:string;email:string;name:string};
async function googleIdentity(c:Awaited<ReturnType<typeof serviceConfig>>,code:string,redirectUri:string):Promise<Identity>{
  const tok=await fetchJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.googleClientId,client_secret:c.googleClientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri})});
  const info=await fetchJson('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tok.access_token}});
  return {sub:String(info.sub||''),email:info.email_verified&&info.email?String(info.email).toLowerCase():'',name:info.name?String(info.name):''};
}
/** Apple's client secret is a short-lived ES256 JWT signed with the team's .p8 private key; cached until it nears expiry. */
let appleSecret={token:'',exp:0};
async function appleClientSecret(c:Awaited<ReturnType<typeof serviceConfig>>){
  if(appleSecret.token&&appleSecret.exp>now()+120000)return appleSecret.token;
  const iat=Math.floor(now()/1000),exp=iat+3000;
  const input=b64urlJson({alg:'ES256',kid:c.appleKeyId})+'.'+b64urlJson({iss:c.appleTeamId,iat,exp,aud:'https://appleid.apple.com',sub:c.appleClientId});
  const pem=c.applePrivateKey.replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s+/g,'');
  const key=await crypto.subtle.importKey('pkcs8',fromB64(pem),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input));
  appleSecret={token:input+'.'+b64url(sig),exp:exp*1000};
  return appleSecret.token;
}
async function appleIdentity(c:Awaited<ReturnType<typeof serviceConfig>>,code:string,redirectUri:string,userJson:string|undefined):Promise<Identity>{
  const tok=await fetchJson('https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.appleClientId,client_secret:await appleClientSecret(c),code,grant_type:'authorization_code',redirect_uri:redirectUri})});
  const parts=String(tok.id_token||'').split('.');if(parts.length!==3)throw new OauthError('failed');
  let claims:Record<string,unknown>;try{claims=JSON.parse(new TextDecoder().decode(fromB64url(parts[1])))}catch{throw new OauthError('failed')}
  if(claims.iss!=='https://appleid.apple.com'||claims.aud!==c.appleClientId||Number(claims.exp)*1000<now())throw new OauthError('failed');
  let name='';try{const u=userJson?JSON.parse(userJson):null;name=[u?.name?.firstName,u?.name?.lastName].filter(Boolean).join(' ')}catch{/* name is optional and only sent once */}
  const verified=claims.email_verified!==false&&claims.email_verified!=='false';
  return {sub:String(claims.sub||''),email:verified&&claims.email?String(claims.email).toLowerCase():'',name};
}

async function upsertUser(provider:OauthProvider,identity:Identity,state:{r:string;f:string},req:Request){
  const link=await one('SELECT user_id FROM accounts WHERE provider=? AND provider_account_id=?',provider,identity.sub);
  if(link){const u=await one('SELECT id,status FROM users WHERE id=?',link.user_id);if(!u)throw new OauthError('failed');if(u.status!=='active')throw new OauthError('suspended');return u.id as string;}
  if(!identity.email)throw new OauthError('no_email');
  const existing=await one('SELECT id,status,email_verified FROM users WHERE email=?',identity.email);
  if(existing){
    if(existing.status!=='active')throw new OauthError('suspended');
    await run('INSERT OR IGNORE INTO accounts (id,user_id,provider,provider_account_id) VALUES (?,?,?,?)',uid('acc_'),existing.id,provider,identity.sub);
    // The provider has verified this email. If the account was never verified, any password on it was set by someone
    // who never proved they own the address, so clear that password and its sessions (anti pre-hijacking); the real
    // owner can set a new password with "Forgot password". A verified account keeps its password untouched.
    if(existing.email_verified)await run('UPDATE users SET email_verified=1 WHERE id=?',existing.id);
    else await batch([stmt('UPDATE users SET email_verified=1,password_hash=NULL WHERE id=?',existing.id),stmt('DELETE FROM sessions WHERE user_id=?',existing.id)]);
    return existing.id as string;
  }
  const id=uid('usr_'),at=now(),lang=langFromCookie(req.headers.get('cookie'));
  const name=(identity.name||identity.email.split('@')[0]||'Friend').slice(0,80);
  // No password (sign-in is through the provider; a password can be set later via "Forgot password"). The provider
  // verified the email, so the account is verified and welcome credits apply. Consent is recorded as at the login
  // page, which states that continuing accepts the Terms and the minimum age.
  await run('INSERT INTO users (id,email,name,password_hash,role,status,email_verified,created_at,terms_version,terms_accepted_at,age_confirmed_at,marketing_opt_in,locale) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',id,identity.email,name,null,'user','active',1,at,TERMS_VERSION,at,at,0,lang);
  await run('INSERT INTO accounts (id,user_id,provider,provider_account_id) VALUES (?,?,?,?)',uid('acc_'),id,provider,identity.sub);
  await attachReferral(id,state.f||undefined);
  await grantWelcomeCredits(id).catch(e=>reportError('credits','Welcome credits need review',{error:e}));
  return id;
}

function cookie(name:string,value:string,maxAge:number,req:Request){
  const secure=new URL(req.url).protocol==='https:';
  // Apple returns via a cross-site POST (response_mode=form_post), where a Lax cookie is withheld; None;Secure is sent.
  return `${name}=${value}; HttpOnly; Path=/; SameSite=${secure?'None':'Lax'}; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
function redirect(location:string,req:Request,...cookies:string[]){
  const headers=new Headers({Location:location});for(const c of cookies)headers.append('Set-Cookie',c);
  return new Response(null,{status:302,headers});
}

/** Begin a flow: validate the provider is configured, then redirect to the provider with a signed state + nonce cookie. */
export async function oauthStart(req:Request,provider:string){
  if(!isProvider(provider))throw new HttpError(404,'Unknown sign-in provider.');
  await rateLimit('oauth-start:'+(req.headers.get('cf-connecting-ip')||'anon'),40,600000);
  const c=await serviceConfig(true);
  if(!oauthConfigured(c)[provider])throw new HttpError(404,'This sign-in method is not available.');
  const url=new URL(req.url);
  const next=safePath(url.searchParams.get('next')),ref=(url.searchParams.get('ref')||'').slice(0,20);
  const {state,nonce}=await makeState(provider,next,ref);
  const redirectUri=c.origin+'/api/auth/oauth/'+provider+'/callback';
  const authUrl=provider==='google'
    ?'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:c.googleClientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,prompt:'select_account'})
    :'https://appleid.apple.com/auth/authorize?'+new URLSearchParams({client_id:c.appleClientId,redirect_uri:redirectUri,response_type:'code',response_mode:'form_post',scope:'name email',state});
  return redirect(authUrl,req,cookie('oauth_state',nonce,600,req));
}

/** Finish a flow: verify state + nonce, exchange the code, create or link the account, open a session. */
export async function oauthCallback(req:Request,provider:string){
  const c=await serviceConfig(true);
  const clear=cookie('oauth_state','',0,req);
  try{
    if(!isProvider(provider))throw new OauthError('failed');
    if(!oauthConfigured(c)[provider])throw new OauthError('unavailable');
    const url=new URL(req.url);
    const params:Record<string,string>=req.method==='POST'
      ?Object.fromEntries([...(await req.formData()).entries()].map(([k,v])=>[k,String(v)]))
      :Object.fromEntries(url.searchParams.entries());
    if(params.error)throw new OauthError('cancelled');
    const state=await readState(params.state||'');
    if(state.p!==provider)throw new OauthError('failed');
    const nonce=req.headers.get('cookie')?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
    if(!nonce||!constantEqual(nonce,state.n))throw new OauthError('failed');
    if(!params.code)throw new OauthError('failed');
    await rateLimit('oauth-cb:'+await hash(state.n),5,600000);
    const redirectUri=c.origin+'/api/auth/oauth/'+provider+'/callback';
    const identity=provider==='google'?await googleIdentity(c,params.code,redirectUri):await appleIdentity(c,params.code,redirectUri,params.user);
    if(!identity.sub)throw new OauthError('failed');
    const userId=await upsertUser(provider,identity,state,req);
    return redirect(c.origin+safePath(state.r),req,await sessionCookie(userId,req),clear);
  }catch(e){
    const code=e instanceof OauthError?e.code:'failed';
    if(!(e instanceof OauthError))await reportError('auth','Social sign-in failed',{error:e,context:{provider}});
    return redirect(c.origin+'/login?error='+code,req,clear);
  }
}
