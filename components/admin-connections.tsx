'use client';
import type {ConnectionStatus} from '@/lib/api-types';
import {useState} from 'react';
import {ArrowUpRight,CheckCircle2,LockKeyhole,Plug,RefreshCw,ShieldCheck,AlertCircle} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,Busy,ErrorBox,Loading,Field} from './shared';

const groups=[
  {name:'Payments',description:'Sell credit packs through POK. Copy the SDK key and merchant ID from your POK merchant account.',href:'https://pokpay.io',link:'Open POK',fields:[['POK_KEY_ID','POK key ID','Paste your key ID'],['POK_KEY_SECRET','POK key secret','Paste your key secret'],['POK_MERCHANT_ID','POK merchant ID','Paste your merchant ID'],['POK_ENVIRONMENT','POK environment','staging']]},
  {name:'AI generation',description:'The ready-made photo-to-video workflow uses Higgsfield. fal.ai and Replicate are available for custom workflows.',href:'https://cloud.higgsfield.ai',link:'Open Higgsfield',fields:[['HIGGSFIELD_API_KEY','Higgsfield API key ID','Paste your key ID'],['HIGGSFIELD_API_SECRET','Higgsfield API key secret','Paste your key secret'],['FAL_KEY','fal.ai API key · optional','Paste your complete API key'],['REPLICATE_API_TOKEN','Replicate API token · optional','Paste your token']]},
  {name:'Account email',description:'Send account verification and password reset links. Use a sending domain you have verified in Resend.',href:'https://resend.com/api-keys',link:'Open Resend',fields:[['RESEND_API_KEY','Resend sending API key','re_…'],['MAIL_FROM','Verified sender address','hello@mail.yourdomain.com']]},
];
export default function Connections(){
  const {data,error,loading,refresh}=useAPI<ConnectionStatus>('admin/connections');
  const [values,setValues]=useState<Record<string,string>>({}),[remove,setRemove]=useState<string[]>([]),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  if(loading||!data)return error?<ErrorBox message={error} retry={refresh}/>:<Loading/>;
  const readiness=data.readiness;
  const changes=Object.fromEntries(Object.entries(values).filter(([key,value])=>value.trim()&&!remove.includes(key)));
  async function save(e:React.FormEvent){
    e.preventDefault();setBusy(true);setFailure('');
    try{await api('admin/connections','PATCH',{values:changes,remove,currentPassword:password});setValues({});setRemove([]);setPassword('');await refresh();toast.success('Connections saved securely.');}
    catch(e){setFailure((e as Error).message)}finally{setBusy(false)}
  }
  return <>
    <div className="admin-heading"><div><span className="eyebrow">STUDIO MANAGEMENT</span><h1>Connect your studio.</h1><p>Your accounts power the experience. Your customers only choose a result.</p></div><button className="button secondary small" onClick={()=>refresh()}><RefreshCw size={16}/>Refresh</button></div>
    <section className="panel connection-intro"><Plug size={25}/><div><h2>{readiness.demo?'Development mode':readiness.ready?'Services configured':'Production setup'}</h2><p>{readiness.demo?'The development simulator is enabled. Production mode is controlled by your hosting configuration.':readiness.ready?'Connection settings are present. Verify live payments, email delivery, and AI results before inviting customers.':'Simulation is off. The catalog and admin work now; buying credits stays closed until all required services are configured.'}</p></div><span className={'status '+(readiness.ready?'completed':'pending')}>{readiness.ready?'Configured':'Setup required'}</span></section>
    <form onSubmit={save} autoComplete="off">
      <div className="connection-grid">{groups.map(group=><section className="panel connection-card" key={group.name}><div className="panel-heading"><h2>{group.name}</h2><a className="text-link" href={group.href} target="_blank" rel="noreferrer">{group.link}<ArrowUpRight size={15}/></a></div><p>{group.description}</p>{group.fields.map(([key,label,placeholder])=>{
        const field=data.fields[key],managed=field.source==='environment';
        return <div className="connection-field" key={key}><Field label={label} hint={managed?'Managed by your hosting environment.':key==='POK_ENVIRONMENT'?'Staging takes test payments only. Choose production for real money.':field.configured?'Saved. Leave blank to keep the current value.':'Not connected yet.'}>{key==='POK_ENVIRONMENT'
          ?<select disabled={managed||busy||remove.includes(key)} value={values[key]||field.value||'staging'} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}><option value="staging">Staging (test payments)</option><option value="production">Production (real payments)</option></select>
          :<input type={key==='MAIL_FROM'?'email':key==='POK_MERCHANT_ID'?'text':'password'} autoComplete="off" spellCheck={false} data-lpignore="true" disabled={managed||busy||remove.includes(key)} placeholder={(key==='MAIL_FROM'||key==='POK_MERCHANT_ID')&&field.value?field.value:placeholder} value={values[key]||''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>}</Field>{field.configured&&!managed&&<label className="connection-remove"><input type="checkbox" checked={remove.includes(key)} onChange={e=>setRemove(r=>e.target.checked?[...r,key]:r.filter(k=>k!==key))}/>Remove this saved connection</label>}</div>;
      })}{group.name==='Payments'&&<div className="connection-help"><strong>Payment updates</strong><code>{data.webhookUrl}</code><p>Each POK order tells POK to notify this address, so there is nothing to register in POK. The studio always confirms a payment with POK before adding credits. POK does not report refunds: after refunding a customer in POK, record it under Credit purchases with Reverse.</p>{readiness.paymentMode==='test'&&<p className="readiness-warning">POK staging is selected. It cannot collect real money. Choose production for sales.</p>}</div>}</section>)}</div>
      <section className="panel connection-save"><div><h2><LockKeyhole size={19}/>Save connections securely</h2><p>Keys are encrypted on the server and are never returned by the API. Saving does not charge your accounts or send an email.</p></div><Field label="Confirm your administrator password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>{failure&&<ErrorBox message={failure}/>}<button className="button primary" disabled={busy||!password||!Object.keys(changes).length&&!remove.length}>{busy?<Busy/>:<ShieldCheck size={18}/>}Save connections</button></section>
    </form>
    <section className="panel"><div className="panel-heading"><h2>Before opening credit sales</h2><a className="text-link" href="/admin/operations">Open operations<ArrowUpRight size={15}/></a></div>{[
      ['POK payments',readiness.payments,'Save the POK key ID, key secret and merchant ID.'],
      ['Email sender',readiness.email,'Connect Resend with an address on a verified domain.'],
      ['AI provider',readiness.ai,'Save the Higgsfield key ID and secret, then enable Higgsfield under AI providers.'],
      ['Background processing',readiness.dispatcher,'Run the queue dispatcher continuously. Operations shows its last heartbeat.'],
      ['Public service access',readiness.publicAccess,'The hosting owner must enable public access so POK and AI providers can reach the app. After that, set PUBLIC_SERVICE_ACCESS=true in the hosting environment.'],
    ].map(([label,ready,note])=><div className="service-check" key={String(label)}>{ready?<CheckCircle2 size={19} className="profit-positive"/>:<AlertCircle size={19} className="readiness-warning"/>}<div><strong>{label}</strong><small>{note}</small></div></div>)}<p className="panel-note">Configuration checks do not verify account balances, model quality, or successful provider calls.</p></section>
    <section className="panel"><h2>Make your first template</h2><p>Open Templates, set its name, preview and credit cost, then choose AI workflow. Use the photo-to-video preset and write your hidden prompt. Publish when the preview matches a result you have tested.</p><a className="button secondary small" href="/admin/templates/new">Create a template<ArrowUpRight size={16}/></a></section>
  </>;
}
