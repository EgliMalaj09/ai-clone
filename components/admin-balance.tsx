'use client';
import {useState} from 'react';
import {AlertTriangle,PauseCircle,Wallet} from 'lucide-react';
import {toast} from 'sonner';
import {Switch} from '@/components/ui/switch';
import {api,useAPI,Busy,ErrorBox,Field,Loading,date} from './shared';

/** The studio's own estimate of the Higgsfield balance (lib/server/provider-balance.ts). Amounts are USD cents. */
type ProviderBalance={tracking:boolean;balance:number|null;available:number|null;spent:number;reserved:number;perVideo:number|null;videosLeft:number|null;low:boolean;paused:boolean;since:number|null;
 alertBelow:number;pauseBelow:number;autoPause:boolean;entries:{kind:'topup'|'set';amount:number;at:number;note:string;by:string}[]};
const usd=(cents:number)=>(cents<0?'−':'')+'$'+(Math.abs(cents)/100).toFixed(2);
const num=(v:string)=>Number(v.replace(',','.'));

/** Thin warning across the admin when the balance is low or creation is paused. */
export function BalanceBanner(){
 const {data}=useAPI<ProviderBalance>('admin/provider-balance');
 if(!data?.tracking||!data.low)return null;
 return <a href="/admin#higgsfield-balance" className={'balance-banner'+(data.paused?' paused':'')} role="status">{data.paused?<PauseCircle size={17}/>:<AlertTriangle size={17}/>}
  <span>{data.paused?<><strong>New videos are paused.</strong> The estimated Higgsfield balance is {usd(data.available??0)}. Top up in Higgsfield, then add the top-up here.</>:<><strong>Higgsfield balance is low:</strong> about {usd(data.available??0)} left{data.videosLeft!==null?` (≈ ${data.videosLeft} videos)`:''}.</>}</span></a>;
}

export function ProviderBalanceCard(){
 const {data:b,error,loading,refresh}=useAPI<ProviderBalance>('admin/provider-balance');
 const [topup,setTopup]=useState(''),[note,setNote]=useState(''),[correct,setCorrect]=useState(''),[busy,setBusy]=useState('');
 const [levels,setLevels]=useState<{alert:string;pause:string;auto:boolean}|null>(null);
 if(loading||!b)return error?<ErrorBox message={error} retry={refresh}/>:<Loading rows={1}/>;
 const lv=levels??{alert:String(b.alertBelow/100),pause:String(b.pauseBelow/100),auto:b.autoPause};
 async function send(kind:'topup'|'set',amount:string,label:string){setBusy(kind);try{await api('admin/provider-balance','POST',{kind,amount:num(amount),note:kind==='topup'?note:'Corrected from the Higgsfield console'});toast.success(label);setTopup('');setNote('');setCorrect('');void refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy('')}}
 async function saveLevels(){setBusy('levels');try{await api('admin/provider-balance','PATCH',{alertBelow:num(lv.alert),pauseBelow:num(lv.pause),autoPause:lv.auto});toast.success('Safeguard saved');setLevels(null);void refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy('')}}
 const state=!b.tracking?null:b.paused?<span className="status failed">Creation paused</span>:b.low?<span className="status pending">Low</span>:<span className="status completed">OK</span>;
 return <section className="panel balance-card" id="higgsfield-balance">
  <div className="panel-heading"><h2><Wallet size={19}/> Higgsfield balance</h2>{state}</div>
  {!b.tracking?<><p>Higgsfield’s API doesn’t share your balance, so the studio keeps its own estimate. Type the balance shown in your Higgsfield console (Billing) to start.</p>
   <form className="code-form" onSubmit={e=>{e.preventDefault();void send('set',correct,'Balance tracking started')}}><input type="number" min={0} step={0.01} required placeholder="e.g. 20.00" aria-label="Current Higgsfield balance in US dollars" value={correct} onChange={e=>setCorrect(e.target.value)}/><button className="button primary small" disabled={!!busy}>{busy==='set'?<Busy/>:'Start tracking'}</button></form></>
  :<>
   <div className="balance-figures"><div><span>Estimated left</span><strong className={b.paused?'profit-negative':b.low?'balance-low':''}>{usd(b.available??0)}</strong>{b.videosLeft!==null&&<small>≈ {b.videosLeft} videos at about {usd(b.perVideo??0)} each</small>}</div>
    <div><span>Spent since {b.since?date(b.since):'start'}</span><strong>{usd(b.spent)}</strong></div>{b.reserved>0&&<div><span>Running videos</span><strong>{usd(b.reserved)}</strong></div>}</div>
   <div className="form-grid"><form onSubmit={e=>{e.preventDefault();void send('topup',topup,'Top-up added')}}><Field label="Add a top-up ($)" hint="After you add funds in the Higgsfield console."><input type="number" min={0.01} step={0.01} required value={topup} onChange={e=>setTopup(e.target.value)}/></Field><Field label="Note (optional)"><input maxLength={120} value={note} onChange={e=>setNote(e.target.value)}/></Field><button className="button primary small" disabled={!!busy}>{busy==='topup'?<Busy/>:'Add top-up'}</button></form>
    <form onSubmit={e=>{e.preventDefault();void send('set',correct,'Balance corrected')}}><Field label="Correct the balance ($)" hint="Type the exact balance from the Higgsfield console now and then, so the estimate stays accurate."><input type="number" min={0} step={0.01} required value={correct} onChange={e=>setCorrect(e.target.value)}/></Field><button className="button secondary small" disabled={!!busy}>{busy==='set'?<Busy/>:'Save correct balance'}</button></form></div>
  </>}
  <details className="balance-settings"><summary>Warning and pause levels</summary>
   <div className="form-grid"><Field label="Warn me below ($)" hint="A banner in admin and one email to administrators."><input type="number" min={0} step={0.5} value={lv.alert} onChange={e=>setLevels({...lv,alert:e.target.value})}/></Field><Field label="Pause new videos below ($)" hint="Customers see that creation is paused for a while. Credits are not taken."><input type="number" min={0} step={0.5} value={lv.pause} onChange={e=>setLevels({...lv,pause:e.target.value})}/></Field></div>
   <label className="switch-row"><div><strong>Pause automatically</strong><small>Stops new videos before Higgsfield runs out, so no video gets stuck waiting.</small></div><Switch checked={lv.auto} onCheckedChange={v=>setLevels({...lv,auto:v})} aria-label="Pause automatically"/></label>
   <button className="button secondary small" disabled={!!busy||!levels} onClick={saveLevels}>{busy==='levels'?<Busy/>:'Save levels'}</button></details>
  {b.entries.length>0&&<details className="balance-settings"><summary>Recent top-ups and corrections</summary><ul className="balance-entries">{b.entries.map((e,i)=><li key={i}><span>{date(e.at)} · {e.kind==='topup'?'Top-up':'Corrected to'}{e.note&&e.kind==='topup'?' · '+e.note:''}</span><b>{e.kind==='topup'?'+':''}{usd(e.amount)}</b></li>)}</ul></details>}
  <p className="panel-note">An estimate: top-ups and corrections minus the AI cost the studio records for each finished Higgsfield video. Check it against the Higgsfield console now and then.</p>
 </section>;
}

type AlertOverview={mailFailingSince:number|null;worker:'running'|'stopped'|'not started';demo:boolean;trial:{today:number;month:number;cost:number}};
const isLocal=()=>typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname);

/** Red banners across the admin when emails fail or the background worker stopped (V53). */
export function AlertsBanner(){
 const {data}=useAPI<AlertOverview>('admin/alerts');
 if(!data)return null;
 const workerDown=data.worker==='stopped'&&!isLocal();
 if(!data.mailFailingSince&&!workerDown)return null;
 return <>{data.mailFailingSince&&<a href="/admin/connections" className="balance-banner paused" role="status"><AlertTriangle size={17}/><span><strong>Emails are failing</strong> since {date(data.mailFailingSince)}. Customers may not get verification codes. Check Resend in Connections.</span></a>}
  {workerDown&&<a href="/admin/operations" className="balance-banner paused" role="status"><AlertTriangle size={17}/><span><strong>The background worker stopped.</strong> No video finishes until it runs again. Check the cron trigger in Cloudflare.</span></a>}</>;
}

/** Free trial videos: today, last 30 days and what they cost (V53). */
export function FreeVideoStats(){
 const {data}=useAPI<AlertOverview>('admin/alerts');
 if(!data)return null;
 return <section className="panel"><div className="panel-heading"><h2>Free videos</h2><a className="text-link" href="/admin/settings">Settings</a></div>
  <div className="balance-figures"><div><span>Last 24 hours</span><strong>{data.trial.today}</strong></div><div><span>Last 30 days</span><strong>{data.trial.month}</strong></div><div><span>AI cost, 30 days</span><strong>{usd(data.trial.cost)}</strong></div></div>
  <p className="panel-note">At most 3 free videos per network (IP) every 30 days. You get an email when one day goes above the warning level in Settings → Alerts.</p></section>;
}

/** Who gets the owner alerts, and the free-video warning level (V53). */
export function AlertSettings({value,onSaved}:{value:{emails:string[];trialDaily:number};onSaved:()=>void}){
 const [emails,setEmails]=useState(value.emails.join('\n')),[trial,setTrial]=useState(String(value.trialDaily)),[busy,setBusy]=useState(false);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('admin/settings','PATCH',{alerts:{emails:emails.split(/[\s,;]+/).filter(Boolean),trialDaily:Math.round(num(trial))}});toast.success('Alert settings saved');onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel"><h2>Alerts</h2><p>Emails go out once per problem: a video stuck over 20 minutes, the background worker stopped, emails failing, a payment pending over an hour, many free videos in a day, several real failures in 30 minutes (NSFW refusals don’t count), and a low Higgsfield balance.</p>
  <form onSubmit={save}><Field label="Send alerts to" hint="Up to 5 addresses, one per line."><textarea rows={3} value={emails} onChange={e=>setEmails(e.target.value)}/></Field>
   <Field label="Warn me when free videos in one day go above" hint="0 turns this warning off."><input type="number" min={0} step={1} value={trial} onChange={e=>setTrial(e.target.value)}/></Field>
   <button className="button primary small" disabled={busy}>{busy?<Busy/>:'Save alerts'}</button></form>
  <p className="panel-note">Tip: point a free uptime monitor (for example UptimeRobot) at <code>/api/health</code>. It answers 503 when the background worker has stopped, so you hear about it even at night with no visitors.</p></section>;
}
