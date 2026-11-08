import {z} from 'zod';
import {all,audit,config,now,one,parse,run} from './data';

// Owner alerts (V53): emails to the alert recipients (Admin → Settings → Alerts) when something needs a person:
// a video stuck over 20 minutes, the background worker stopped, emails failing, a payment pending over an hour,
// a spike in free videos, or several real failures in a short time (NSFW refusals do not count).
// Each problem emails once: a row "alert_sent:<key>" marks it sent and is removed once the problem is gone,
// so it emails again only if it comes back.

export const DEFAULT_ALERT_EMAILS=['Vasoxhaja04@gmail.com','eglimalaj999@gmail.com'];
export const DEFAULT_TRIAL_DAILY=20;
const MIN=60000;
const SENT='alert_sent:';

export async function alertSettings(){
 const rows=await all("SELECT key,value FROM app_settings WHERE key IN ('alert_emails','alert_trial_daily')");
 const get=(k:string)=>rows.find(r=>r.key===k)?.value as string|undefined;
 const emails=parse<string[]>(get('alert_emails')??'',DEFAULT_ALERT_EMAILS);
 return {emails:Array.isArray(emails)?emails:DEFAULT_ALERT_EMAILS,trialDaily:get('alert_trial_daily')===undefined?DEFAULT_TRIAL_DAILY:Math.max(0,Number(get('alert_trial_daily'))||0)};
}
export async function saveAlertSettings(userId:string,input:unknown){
 const b=z.object({emails:z.array(z.string().trim().email().max(254)).min(1,'Add at least one email address.').max(5),trialDaily:z.number().int().min(0).max(100000)}).parse(input);
 const up=(k:string,v:string)=>run('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,v);
 await up('alert_emails',JSON.stringify([...new Set(b.emails.map(e=>e.toLowerCase()))]));await up('alert_trial_daily',String(b.trialDaily));
 await audit(userId,'settings.update','alerts');
 return alertSettings();
}

/** Sends the alert once per key; returns true when this call sent it. */
export async function sendAlert(key:string,a:{subject:string;heading:string;lead:string;link?:string;linkLabel?:string}){
 // Claim the key first, in one statement, so two workers never send the same alert.
 const claimed=await run('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)',SENT+key,String(now()));
 if(!claimed.meta.changes)return false;
 const {sendMail}=await import('./security');const {noticeMailContent}=await import('./email-templates');const {serviceConfig}=await import('./connections');
 const c=await serviceConfig();const {emails}=await alertSettings();
 for(const to of emails)await sendMail(to,noticeMailContent({lang:'en',brand:c.brandName,subject:'{brand} alert: '+a.subject,heading:a.heading,lead:a.lead,vars:{},link:c.origin+(a.link||'/admin/operations'),linkLabel:a.linkLabel||'Open the admin',supportEmail:c.mailFrom}),`alert-${key}-${to}`);
 return true;
}
/** The problem is gone: the next time it happens, it emails again. */
export async function clearAlert(key:string){await run('DELETE FROM app_settings WHERE key=?',SENT+key);}
async function alertActive(key:string){return !!await one('SELECT key FROM app_settings WHERE key=?',SENT+key);}

// Email delivery. Every failed send marks email as failing (a red banner in admin); the next good send clears it.
// The alert itself goes through the same email service, so when that is fully down only the banner shows it.
export async function noteMailResult(ok:boolean,detail=''){
 if(ok){if(await one("SELECT key FROM app_settings WHERE key='mail_failing'")){await run("DELETE FROM app_settings WHERE key='mail_failing'");await clearAlert('mail-failing');}return;}
 await run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('mail_failing',?)",String(now()));
 await sendAlert('mail-failing',{subject:'emails are not being sent',heading:'Emails are failing',lead:'The email service refused or failed to send a message'+(detail?' ('+detail+')':'')+'. Customers may not receive verification codes, so new sign-ups can get stuck. Check Resend and Admin → Connections.',link:'/admin/connections',linkLabel:'Check connections'}).catch(()=>{});
}

/** The background worker (cron) must run every minute; without it no video ever finishes. Checked on site requests. */
let lastDispatchCheck=0;
export async function checkDispatcher(){
 if(Date.now()-lastDispatchCheck<2*MIN)return;lastDispatchCheck=Date.now();
 const beat=Number((await one("SELECT value FROM app_settings WHERE key='queue_heartbeat'"))?.value||0);
 if(!beat)return;// never ran yet (new install): nothing to compare
 if(now()-beat>10*MIN)await sendAlert('cron-stopped',{subject:'the background worker stopped',heading:'The background worker stopped',lead:`It last ran ${Math.round((now()-beat)/MIN)} minutes ago. While it is stopped no video finishes. Check the Worker's cron trigger in Cloudflare, or redeploy.`});
 else if(await alertActive('cron-stopped'))await clearAlert('cron-stopped');
}
/** For an outside uptime monitor: 503 when the background worker has not run for 10 minutes. */
export async function healthStatus(){
 const beat=Number((await one("SELECT value FROM app_settings WHERE key='queue_heartbeat'"))?.value||0);
 const workerOk=!beat||now()-beat<=10*MIN;
 return {ok:workerOk,worker:beat?(workerOk?'running':'stopped'):'not started',lastRun:beat||null};
}

/** Runs with every cron tick. Each check is a cheap query. */
export async function runAlertChecks(){
 const t=now(),lines=(rows:string[])=>rows.join('\n');
 // 1. Videos stuck over 20 minutes (the job gives up at 30 minutes and refunds by itself).
 for(const g of await all(`SELECT g.id,g.template_name,g.status,COALESCE(g.started_at,g.created_at) AS since,u.email FROM generations g LEFT JOIN users u ON u.id=g.user_id
   WHERE g.status IN ('queued','preparing','generating','finalizing') AND g.deleted_at IS NULL AND COALESCE(g.started_at,g.created_at)<? ORDER BY g.created_at LIMIT 10`,t-20*MIN))
  await sendAlert('stuck:'+g.id,{subject:'a video is stuck',heading:'A video is stuck',lead:`${g.template_name} for ${g.email||'a deleted account'} has been ${g.status} for ${Math.round((t-Number(g.since))/MIN)} minutes. You can cancel it and refund the credits on the Operations page; otherwise it gives up at 30 minutes and refunds by itself.`});
 // 2. Payments pending over an hour (real POK checkouts only; abandoned demo checkouts are ignored).
 for(const p of await all(`SELECT p.id,p.package_name,p.amount,p.currency,u.email FROM credit_purchases p LEFT JOIN users u ON u.id=p.user_id
   WHERE p.provider='pok' AND p.status='pending' AND p.provider_session_id IS NOT NULL AND p.created_at BETWEEN ? AND ? LIMIT 10`,t-3*86400000,t-60*MIN)){
  const {money}=await import('../contracts');
  await sendAlert('pending:'+p.id,{subject:'a payment is still pending',heading:'A payment has been pending for over an hour',lead:`${p.package_name} · ${money(Number(p.amount),p.currency as string)} for ${p.email||'a deleted account'}. If the customer paid, POK may not have confirmed it: check the order in the POK dashboard.`,link:'/admin/purchases?search='+p.id,linkLabel:'Open the purchase'});
 }
 // 3. Free videos: a spike in one day usually means fake accounts.
 const {trialDaily}=await alertSettings();
 if(trialDaily>0){
  const n=Number((await one('SELECT COUNT(*) AS n FROM generations WHERE trial=1 AND created_at>=?',t-1440*MIN))?.n||0);
  if(n>trialDaily)await sendAlert('trial-spike:'+new Date(t).toISOString().slice(0,10),{subject:'many free videos today',heading:'Unusually many free videos',lead:`${n} free videos in the last 24 hours (your warning level is ${trialDaily}). This can mean fake accounts. Turn the free trial off in Admin → Settings if needed.`,link:'/admin/settings',linkLabel:'Open settings'});
 }
 // 4. Real failures: 3+ failed videos in 30 minutes from at least 2 customers. NSFW refusals are "refused", not "failed".
 const f=await one("SELECT COUNT(*) AS n,COUNT(DISTINCT user_id) AS users FROM generations WHERE status='failed' AND test_run=0 AND completed_at>=?",t-30*MIN);
 if(Number(f?.n||0)>=3&&Number(f?.users||0)>=2){
  const last=(await all("SELECT template_name,internal_error FROM generations WHERE status='failed' AND test_run=0 AND completed_at>=? ORDER BY completed_at DESC LIMIT 3",t-30*MIN)).map(r=>`${r.template_name}: ${String(r.internal_error||'no detail').slice(0,160)}`);
  await sendAlert('failures',{subject:'several videos failed',heading:'Several videos failed in the last 30 minutes',lead:`${f!.n} videos failed for ${f!.users} different customers (NSFW refusals are not counted). The AI provider may be down or the key may have stopped working. Latest errors:\n${lines(last)}`});
 }else if(await alertActive('failures'))await clearAlert('failures');
 // Old one-off alert markers are removed after 30 days.
 await run("DELETE FROM app_settings WHERE key LIKE 'alert_sent:%' AND key NOT IN ('alert_sent:failures','alert_sent:cron-stopped','alert_sent:mail-failing') AND CAST(value AS INTEGER)<?",t-30*1440*MIN);
}

/** What the admin banner shows. */
export async function alertOverview(){
 const [mail,health,trial]=await Promise.all([
  one("SELECT value FROM app_settings WHERE key='mail_failing'"),
  healthStatus(),
  one("SELECT SUM(created_at>=?) AS today,COUNT(*) AS month,(SELECT COALESCE(SUM(s.cost),0) FROM generation_steps s JOIN generations g2 ON g2.id=s.generation_id WHERE g2.trial=1 AND g2.created_at>=? AND s.status='completed') AS cost FROM generations WHERE trial=1 AND created_at>=?",now()-1440*MIN,now()-30*1440*MIN,now()-30*1440*MIN),
 ]);
 return {mailFailingSince:mail?Number(mail.value):null,worker:health.worker,demo:config().demo,
  trial:{today:Number(trial?.today||0),month:Number(trial?.month||0),cost:Number(trial?.cost||0)}};
}
