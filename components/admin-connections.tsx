'use client';
import type {ConnectionStatus} from '@/lib/api-types';
import {useState} from 'react';
import {ArrowUpRight,CheckCircle2,LockKeyhole,Plug,RefreshCw,ShieldCheck,AlertCircle} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,Busy,ErrorBox,Loading,Field} from './shared';

const groups=[
  {name:'Payments',description:'Accept the fixed price of each template through Stripe.',href:'https://dashboard.stripe.com/apikeys',link:'Open Stripe',fields:[['STRIPE_SECRET_KEY','Stripe secret key','sk_live_…'],['STRIPE_WEBHOOK_SECRET','Webhook signing secret','whsec_…']]},
  {name:'AI generation',description:'The ready-made photo-to-video workflow uses fal.ai. Replicate is available for custom workflows.',href:'https://fal.ai/dashboard/keys',link:'Open fal.ai',fields:[['FAL_KEY','fal.ai API key','Paste your complete API key'],['REPLICATE_API_TOKEN','Replicate API token · optional','Paste your token']]},
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
    <section className="panel connection-intro"><Plug size={25}/><div><h2>{readiness.demo?'Development mode':readiness.ready?'Services configured':'Production setup'}</h2><p>{readiness.demo?'The development simulator is enabled. Production mode is controlled by your hosting configuration.':readiness.ready?'Connection settings are present. Verify live payments, email delivery, and AI results before inviting customers.':'Simulation is off. The catalog and admin work now; checkout stays closed until all required services are configured.'}</p></div><span className={'status '+(readiness.ready?'completed':'pending')}>{readiness.ready?'Configured':'Setup required'}</span></section>
    <form onSubmit={save} autoComplete="off">
      <div className="connection-grid">{groups.map(group=><section className="panel connection-card" key={group.name}><div className="panel-heading"><h2>{group.name}</h2><a className="text-link" href={group.href} target="_blank" rel="noreferrer">{group.link}<ArrowUpRight size={15}/></a></div><p>{group.description}</p>{group.fields.map(([key,label,placeholder])=>{
        const field=data.fields[key],managed=field.source==='environment';
        return <div className="connection-field" key={key}><Field label={label} hint={managed?'Managed by your hosting environment.':field.configured?'Saved. Leave blank to keep the current value.':'Not connected yet.'}><input type={key==='MAIL_FROM'?'email':'password'} autoComplete="off" spellCheck={false} data-lpignore="true" disabled={managed||busy||remove.includes(key)} placeholder={key==='MAIL_FROM'&&field.value?field.value:placeholder} value={values[key]||''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></Field>{field.configured&&!managed&&<label className="connection-remove"><input type="checkbox" checked={remove.includes(key)} onChange={e=>setRemove(r=>e.target.checked?[...r,key]:r.filter(k=>k!==key))}/>Remove this saved connection</label>}</div>;
      })}{group.name==='Payments'&&<div className="connection-help"><strong>Webhook endpoint</strong><code>{data.webhookUrl}</code><p>In Stripe, subscribe to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded, charge.dispute.created, and refund.updated. Save its signing secret above.</p>{readiness.paymentMode==='test'&&<p className="readiness-warning">A Stripe test key is configured. It cannot collect real money. Use your live key and its matching live webhook for sales.</p>}</div>}</section>)}</div>
      <section className="panel connection-save"><div><h2><LockKeyhole size={19}/>Save connections securely</h2><p>Keys are encrypted on the server and are never returned by the API. Saving does not charge your accounts or send an email.</p></div><Field label="Confirm your administrator password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>{failure&&<ErrorBox message={failure}/>}<button className="button primary" disabled={busy||!password||!Object.keys(changes).length&&!remove.length}>{busy?<Busy/>:<ShieldCheck size={18}/>}Save connections</button></section>
    </form>
    <section className="panel"><div className="panel-heading"><h2>Before opening checkout</h2><a className="text-link" href="/admin/operations">Open operations<ArrowUpRight size={15}/></a></div>{[
      ['Stripe and webhook',readiness.payments,'Save the server API key and webhook signing secret.'],
      ['Email sender',readiness.email,'Connect Resend with an address on a verified domain.'],
      ['AI provider',readiness.ai,'Save a fal.ai key, then enable fal.ai under AI providers.'],
      ['Background processing',readiness.dispatcher,'Run the queue dispatcher continuously. Operations shows its last heartbeat.'],
      ['Public service access',readiness.publicAccess,'The hosting owner must enable public access so Stripe and AI providers can reach the app. After that, set PUBLIC_SERVICE_ACCESS=true in the hosting environment.'],
    ].map(([label,ready,note])=><div className="service-check" key={String(label)}>{ready?<CheckCircle2 size={19} className="profit-positive"/>:<AlertCircle size={19} className="readiness-warning"/>}<div><strong>{label}</strong><small>{note}</small></div></div>)}<p className="panel-note">Configuration checks do not verify account balances, model quality, or successful provider calls.</p></section>
    <section className="panel"><h2>Make your first template</h2><p>Open Templates, set its name, preview and price, then choose AI workflow. Use the photo-to-video preset and write your hidden prompt. Publish when the preview matches a result you have tested.</p><a className="button secondary small" href="/admin/templates/new">Create a template<ArrowUpRight size={16}/></a></section>
  </>;
}
