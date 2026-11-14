import {z} from 'zod';
import {all,audit,must,now,one,parse,run} from './data';
import {reportError} from './errors';
import type {StudioUser} from '../contracts';

// Higgsfield balance safeguard. Higgsfield's API does not report the account balance (it is only in their console),
// and when the balance runs out Higgsfield holds new requests instead of refusing them, so videos would hang.
// The studio keeps its own estimate: the top-ups and corrections the admin types in, minus the AI cost recorded for
// every finished Higgsfield step since then (V15), minus what running videos are expected to cost.
// Below the alert level the admins get one email; below the pause level new creations pause until a top-up.
// Amounts are USD cents, like the recorded step costs.

const KEY='provider_balance';
type Entry={kind:'topup'|'set';amount:number;at:number;note:string;by:string};
type Saved={entries:Entry[];alertBelow:number;pauseBelow:number;autoPause:boolean;lowNotified:boolean;pauseNotified:boolean};
const DEFAULTS:Saved={entries:[],alertBelow:500,pauseBelow:100,autoPause:true,lowNotified:false,pauseNotified:false};
const ACTIVE="('queued','preparing','generating','finalizing')";

// The "already emailed" flags live under their own key, so a background check never rewrites the top-ups.
const FLAGS=KEY+'_notified';
const put=(k:string,v:unknown)=>run('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,JSON.stringify(v));
async function load():Promise<Saved>{
 const rows=await all('SELECT key,value FROM app_settings WHERE key IN (?,?)',KEY,FLAGS);const get=(k:string)=>parse<Record<string,unknown>>(rows.find(r=>r.key===k)?.value as string,{});
 const f=get(FLAGS),saved=get(KEY);
 // A fresh entries array every time: pushing onto the shared default would leak entries between requests.
 return {...DEFAULTS,...saved,entries:Array.isArray(saved.entries)?[...saved.entries]:[],lowNotified:!!f.lowNotified,pauseNotified:!!f.pauseNotified} as Saved;
}
async function store(s:Saved){await put(KEY,{entries:s.entries.slice(-500),alertBelow:s.alertBelow,pauseBelow:s.pauseBelow,autoPause:s.autoPause});}
async function storeFlags(f:{lowNotified:boolean;pauseNotified:boolean}){await put(FLAGS,f);}

export async function providerBalance(){
 const s=await load();
 const base={alertBelow:s.alertBelow,pauseBelow:s.pauseBelow,autoPause:s.autoPause,entries:s.entries.slice(-20).reverse()};
 if(!s.entries.length)return {...base,tracking:false as const,balance:null,available:null,spent:0,reserved:0,perVideo:null,videosLeft:null,low:false,paused:false,since:null};
 // Start from the last correction ("set"), or from the first top-up, and add every top-up after it.
 const setIndex=s.entries.map(e=>e.kind).lastIndexOf('set');
 const start=setIndex>=0?s.entries[setIndex]:null,since=start?start.at:s.entries[0].at;
 const added=s.entries.slice(setIndex+1).filter(e=>e.kind==='topup').reduce((n,e)=>n+e.amount,0);
 const [spentRow,reservedRow,recent]=await Promise.all([
  one("SELECT COALESCE(SUM(cost),0) AS c FROM generation_steps WHERE provider='higgsfield' AND status='completed' AND completed_at>=?",since),
  one(`SELECT COALESCE(SUM(estimated_cost),0) AS c FROM generations WHERE deleted_at IS NULL AND status IN ${ACTIVE} AND currency='USD' AND workflow_snapshot LIKE '%"provider":"higgsfield"%'`),
  all("SELECT SUM(cost) AS c FROM generation_steps WHERE provider='higgsfield' AND status='completed' AND cost IS NOT NULL GROUP BY generation_id ORDER BY MAX(completed_at) DESC LIMIT 20"),
 ]);
 const spent=Number(spentRow?.c||0),reserved=Number(reservedRow?.c||0),balance=(start?start.amount:0)+added-spent,available=balance-reserved;
 // What one video costs: the average of the last 20 real ones, else the cheapest live template's estimated AI cost.
 let perVideo=recent.length?Math.round(recent.reduce((n,r)=>n+Number(r.c||0),0)/recent.length):0;
 if(!perVideo)perVideo=Number((await one("SELECT MIN(estimated_cost) AS c FROM templates WHERE active=1 AND currency='USD' AND estimated_cost>0"))?.c||0);
 return {...base,tracking:true as const,balance,available,spent,reserved,perVideo:perVideo||null,videosLeft:perVideo?Math.max(0,Math.floor(available/perVideo)):null,
  low:available<s.alertBelow,paused:s.autoPause&&available<s.pauseBelow,since};
}

/** True when new creations must wait because the estimated Higgsfield balance is below the pause level. */
export async function balancePaused(){const b=await providerBalance();if(b.paused)await notifyAdmins(b).catch(()=>{});return b.paused;}

const amount=z.number().min(-100000).max(100000);
export async function addBalanceEntry(user:StudioUser,input:unknown){
 const b=z.object({kind:z.enum(['topup','set']),amount,note:z.string().trim().max(120).default('')}).parse(input);
 must(b.kind==='set'||b.amount>0,'Enter the amount you added, more than 0.');
 must(b.kind==='topup'||b.amount>=0,'The balance cannot be below 0.');
 const s=await load();
 s.entries.push({kind:b.kind,amount:Math.round(b.amount*100),at:now(),note:b.note,by:user.email});
 await store(s);await audit(user.id,'provider-balance.'+b.kind,'higgsfield');
 return refreshNotices();
}
export async function saveBalanceSettings(user:StudioUser,input:unknown){
 const b=z.object({alertBelow:z.number().min(0).max(100000),pauseBelow:z.number().min(0).max(100000),autoPause:z.boolean()}).parse(input);
 must(b.alertBelow>=b.pauseBelow,'The warning level must be at or above the pause level.');
 const s=await load();
 await store({...s,alertBelow:Math.round(b.alertBelow*100),pauseBelow:Math.round(b.pauseBelow*100),autoPause:b.autoPause});
 await audit(user.id,'provider-balance.settings','higgsfield');
 return refreshNotices();
}
/** Clears the "already emailed" flags once the balance is back above the levels, so the next drop emails again. */
async function refreshNotices(){
 const b=await providerBalance(),s=await load();
 const next={...s,lowNotified:s.lowNotified&&b.low,pauseNotified:s.pauseNotified&&b.paused};
 if(next.lowNotified!==s.lowNotified||next.pauseNotified!==s.pauseNotified)await storeFlags(next);
 return b;
}

/** Emails every administrator once when the balance gets low, and once when creations pause. Runs hourly and on a pause. */
export async function checkProviderBalance(){const b=await refreshNotices();if(b.low)await notifyAdmins(b);}
async function notifyAdmins(b:Awaited<ReturnType<typeof providerBalance>>){
 if(!b.tracking)return;
 const s=await load();const pausing=b.paused&&!s.pauseNotified,warning=b.low&&!s.lowNotified;
 if(!pausing&&!warning)return;
 await storeFlags({lowNotified:s.lowNotified||b.low,pauseNotified:s.pauseNotified||b.paused});
 try{
  const {sendMail}=await import('./security');const {noticeMailContent}=await import('./email-templates');const {serviceConfig}=await import('./connections');const c=await serviceConfig();
  const usd=(v:number)=>'$'+(v/100).toFixed(2);
  const lead=pausing?'New videos are paused: the estimated Higgsfield balance is {balance}, below your pause level of {level}. Top up in the Higgsfield console, then add the top-up in the admin dashboard to open creation again.'
   :'The estimated Higgsfield balance is {balance}, below your warning level of {level}. Top up soon in the Higgsfield console, then add the top-up in the admin dashboard.';
  const {alertSettings}=await import('./alerts');
  for(const to of (await alertSettings()).emails)
   await sendMail(to,noticeMailContent({lang:'en',brand:c.brandName,subject:pausing?'{brand}: video creation paused (Higgsfield balance)':'{brand}: Higgsfield balance is low',heading:pausing?'Video creation is paused':'Your Higgsfield balance is low',lead,vars:{balance:usd(b.available??0),level:usd(pausing?b.pauseBelow:b.alertBelow)},link:c.origin+'/admin',linkLabel:'Open the admin dashboard',supportEmail:c.mailFrom}),`provider-balance-${pausing?'pause':'low'}-${to}-${Math.floor(now()/3600000)}`);
 }catch(e){await reportError('email','Higgsfield balance email needs a retry',{error:e});}
}
