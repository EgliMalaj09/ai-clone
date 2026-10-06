import {z} from 'zod';
import {all,audit,batch,config,HttpError,must,now,one,runtime,stmt} from './data';
import {jsonBody} from './http';
import {checkPassword,rateLimit} from './security';
import type {AdminTemplate,StudioUser} from '../contracts';

const fields={
  STRIPE_SECRET_KEY:'stripeKey',STRIPE_WEBHOOK_SECRET:'webhookSecret',
  FAL_KEY:'falKey',REPLICATE_API_TOKEN:'replicateKey',
  RESEND_API_KEY:'mailKey',MAIL_FROM:'mailFrom',
} as const;
type Field=keyof typeof fields;
const names=Object.keys(fields) as Field[];
const encoder=new TextEncoder();
const encode=(bytes:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

async function encryptionKey(){
  must(config().secret.length>=32,'Configure the application signing key before storing connections.',503);
  const source=await crypto.subtle.importKey('raw',encoder.encode(config().secret),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('project-studio/connections/v1'),info:encoder.encode('AES-256-GCM')},source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(name:Field,value:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(name)},await encryptionKey(),encoder.encode(value));
  return JSON.stringify({v:1,iv:encode(iv),data:encode(ciphertext)});
}
async function unseal(name:Field,value:string){
  try{
    const record=JSON.parse(value);if(record.v!==1)throw new Error('Version');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv),additionalData:encoder.encode(name)},await encryptionKey(),decode(record.data)));
  }catch{throw new HttpError(503,'A saved connection could not be unlocked. Restore the application signing key or replace the connection.');}
}

/** Server only. Environment-managed keys take precedence. Never serialize this object. */
export async function serviceConfig(tolerant=false){
  const c=config();
  const records=await all("SELECT key,value FROM app_settings WHERE key LIKE 'connection.%'");
  for(const name of names){
    const record=records.find(r=>r.key==='connection.'+name);
    if(!c[fields[name]]&&record){try{c[fields[name]]=await unseal(name,record.value)}catch(e){if(!tolerant)throw e;}}
  }
  return c;
}

export async function purchaseReadiness(){
  const c=await serviceConfig(true);
  const [heartbeat,enabled]=await Promise.all([
    one("SELECT value FROM app_settings WHERE key='queue_dispatch_heartbeat'"),
    all('SELECT id FROM provider_configurations WHERE enabled=1'),
  ]);
  const payments=!!c.stripeKey&&!!c.webhookSecret;
  const email=!!c.mailKey&&!!c.mailFrom;
  const ai=enabled.some(p=>p.id==='fal'?!!c.falKey:p.id==='replicate'?!!c.replicateKey:false);
  const dispatcher=!!c.cronSecret&&Number(heartbeat?.value)>now()-180000;
  const publicAccess=runtime().PUBLIC_SERVICE_ACCESS==='true';
  return {demo:c.demo,ready:c.demo||payments&&email&&ai&&dispatcher&&publicAccess,
    registrationAvailable:c.demo||email,payments,email,ai,dispatcher,publicAccess,
    paymentMode:c.stripeKey.startsWith('sk_live_')||c.stripeKey.startsWith('rk_live_')?'live':c.stripeKey?'test':'missing',
    enabledProviders:enabled.filter(p=>p.id==='fal'?!!c.falKey:p.id==='replicate'?!!c.replicateKey:c.demo).map(p=>p.id as string),
  };
}
/** Generation needs an AI provider, the background dispatcher and public access; it does not need payments. */
function generationReady(r:Awaited<ReturnType<typeof purchaseReadiness>>){return r.demo||r.ai&&r.dispatcher&&r.publicAccess;}
function templateRunnable(template:AdminTemplate,r:Awaited<ReturnType<typeof purchaseReadiness>>){
  return template.workflow.length>0&&template.workflow.every(s=>r.enabledProviders.includes(s.provider)&&(r.demo?s.provider==='mock':s.provider!=='mock'));
}
export async function assertGeneratable(template:AdminTemplate){
  const r=await purchaseReadiness();
  must(template.workflow.length>0&&template.workflow.every(s=>r.demo?s.provider==='mock':s.provider!=='mock'),'This template is not available yet.',409);
  must(generationReady(r),'Video creation is not open yet. Please check back soon.',503);
  must(templateRunnable(template,r),'This template is temporarily unavailable.',503);
}
/** What the storefront may offer: registration, buying credits (needs payments) and generating a template. */
export async function publicAvailability(template?:AdminTemplate|null){
  const r=await purchaseReadiness();
  return {registrationAvailable:r.registrationAvailable,purchasingAvailable:r.ready,generationAvailable:generationReady(r)&&(!template||templateRunnable(template,r))};
}
export async function connectionStatus(){
  const c=await serviceConfig(true),readiness=await purchaseReadiness();
  const saved=await all("SELECT key FROM app_settings WHERE key LIKE 'connection.%'");
  return {readiness,webhookUrl:config().origin+'/api/webhooks/stripe',
    fields:Object.fromEntries(names.map(name=>[name,{configured:!!c[fields[name]],source:runtime()[name]?'environment':saved.some(r=>r.key==='connection.'+name)?'encrypted':'missing',...(name==='MAIL_FROM'?{value:c.mailFrom}:{})}])),
  };
}
const keySchema=z.enum(['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','FAL_KEY','REPLICATE_API_TOKEN','RESEND_API_KEY','MAIL_FROM']);
export async function updateConnections(req:Request,user:StudioUser){
  await rateLimit('connections:'+user.id,8,900000);
  const body=z.object({currentPassword:z.string().min(1).max(128),values:z.record(keySchema,z.string().trim().min(1).max(1024)).default({}),remove:z.array(keySchema).max(6).default([])}).strict().parse(await jsonBody(req));
  const account=await one('SELECT password_hash FROM users WHERE id=?',user.id);
  must(account&&await checkPassword(body.currentPassword,account.password_hash),'Your administrator password is incorrect.',403);
  const entries=Object.entries(body.values) as [Field,string][];
  const changed=[...entries.map(([name])=>name),...body.remove];
  must(changed.length>0&&new Set(changed).size===changed.length,'Choose distinct connections to save or remove.');
  for(const name of changed)must(!runtime()[name],'This connection is managed in the hosting environment: '+name,409);
  for(const [name,value] of entries){
    must(!/[\r\n\u0000]/.test(value),'Connection values cannot contain control characters.');
    if(name==='STRIPE_SECRET_KEY')must(/^(sk|rk)_(test|live)_[A-Za-z0-9]{12,}$/.test(value),'Use a Stripe server API key. A publishable key cannot accept payments.');
    if(name==='STRIPE_WEBHOOK_SECRET')must(/^whsec_[A-Za-z0-9]{12,}$/.test(value),'Use the signing secret from your Stripe webhook endpoint.');
    if(name==='RESEND_API_KEY')must(/^re_[A-Za-z0-9_-]{12,}$/.test(value),'Use a valid Resend API key.');
    if(name==='FAL_KEY'||name==='REPLICATE_API_TOKEN')must(value.length>=16&&!/\s/.test(value),'Use the complete provider API key.');
    if(name==='MAIL_FROM')must(z.string().email().safeParse(value).success,'Use an email address on your verified sending domain.');
  }
  const writes=[];
  for(const [name,value] of entries)writes.push(stmt('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','connection.'+name,await seal(name,value)));
  for(const name of body.remove)writes.push(stmt('DELETE FROM app_settings WHERE key=?','connection.'+name));
  await batch(writes);
  // Audit connection names only; never passwords, key fragments, or ciphertext.
  await audit(user.id,'connections.updated',changed.join(','));
  return {ok:true};
}
