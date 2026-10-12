'use client';
import {useState} from 'react';
import {TicketPercent} from 'lucide-react';
import {toast} from 'sonner';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Switch} from '@/components/ui/switch';
import {api,useAPI,Busy,ErrorBox,Field,Loading,Pick,date} from './shared';
import {credits} from '@/lib/contracts';

// Promo codes and the referral reward (V4).
type Code={id:string;code:string;kind:string;credits:number;percent:number;maxUses:number|null;uses:number;expiresAt:number|null;active:boolean;note:string;createdAt:number};
export function PromosPanel(){
 const {data,error,loading,refresh}=useAPI<{referralCredits:number;codes:Code[]}>('admin/promos');
 const [form,setForm]=useState({code:'',kind:'credits',credits:'100',percent:'20',maxUses:'',expires:'',note:''}),[busy,setBusy]=useState(false),[referral,setReferral]=useState<string|null>(null);
 const set=(k:keyof typeof form)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(f=>({...f,[k]:e.target.value}));
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('admin/promos','POST',{code:form.code,kind:form.kind,credits:Number(form.credits)||0,percent:Number(form.percent)||0,maxUses:form.maxUses?Number(form.maxUses):null,expiresAt:form.expires?new Date(form.expires+'T23:59:59').getTime():null,note:form.note});toast.success('Code created');setForm(f=>({...f,code:'',note:''}));await refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 if(loading||!data)return error?<ErrorBox message={error} retry={refresh}/>:<Loading/>;
 return <><div className="admin-heading"><div><span className="eyebrow">MARKETING</span><h1>Promo codes</h1><p>Codes that give credits, or a percentage off a credit pack. Each customer can use a code once. Discounts on ALL prices are rounded to whole lek.</p></div></div>
  <div className="admin-two-columns"><section className="panel"><h2><TicketPercent size={19}/> New code</h2><form onSubmit={create}>
   <div className="form-grid"><Field label="Code" hint="Letters and numbers, e.g. WELCOME20."><input required value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} maxLength={30}/></Field><Field label="Type"><Pick label="Code type" value={form.kind} onChange={v=>setForm(f=>({...f,kind:v}))} options={[{value:'credits',label:'Gives credits'},{value:'discount',label:'Discount on a pack'}]}/></Field></div>
   <div className="form-grid">{form.kind==='credits'?<Field label="Credits to give"><input type="number" min={1} max={100000} value={form.credits} onChange={set('credits')}/></Field>:<Field label="Percent off (1–90)"><input type="number" min={1} max={90} value={form.percent} onChange={set('percent')}/></Field>}<Field label="Total uses (optional)"><input type="number" min={1} value={form.maxUses} onChange={set('maxUses')} placeholder="Unlimited"/></Field></div>
   <div className="form-grid"><Field label="Valid until (optional)"><input type="date" value={form.expires} onChange={set('expires')}/></Field><Field label="Note (only for you)"><input value={form.note} onChange={set('note')} maxLength={200} placeholder="e.g. Instagram campaign"/></Field></div>
   <button className="button primary small" disabled={busy||form.code.trim().length<3}>{busy?<Busy/>:'Create code'}</button></form></section>
  <section className="panel"><h2>Invite friends</h2><p className="panel-note">When someone joins with a customer’s invite link and makes their first purchase, both get these credits. 0 turns invites off (the invite box is then hidden).</p><form onSubmit={async e=>{e.preventDefault();try{await api('admin/promos/referral','PATCH',{credits:Number(referral??data.referralCredits)});toast.success('Saved');setReferral(null);await refresh()}catch(e){toast.error((e as Error).message)}}}><Field label="Credits for each person"><input type="number" min={0} max={100000} value={referral??String(data.referralCredits)} onChange={e=>setReferral(e.target.value)}/></Field><button className="button secondary small" disabled={referral===null}>Save</button></form></section></div>
  <section className="panel"><h2>Codes</h2>{data.codes.length?<div className="table-panel"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Gives</TableHead><TableHead>Used</TableHead><TableHead>Valid until</TableHead><TableHead>Active</TableHead></TableRow></TableHeader><TableBody>{data.codes.map(c=><TableRow key={c.id}><TableCell><strong className="mono">{c.code}</strong>{c.note&&<small className="block">{c.note}</small>}</TableCell><TableCell>{c.kind==='credits'?credits(c.credits):c.percent+'% off a pack'}</TableCell><TableCell>{c.uses}{c.maxUses!==null?' / '+c.maxUses:''}</TableCell><TableCell>{c.expiresAt?date(c.expiresAt):'—'}</TableCell><TableCell><Switch checked={c.active} aria-label={'Code '+c.code+' active'} onCheckedChange={async v=>{try{await api('admin/promos/'+c.id,'PATCH',{active:v});await refresh()}catch(e){toast.error((e as Error).message)}}}/></TableCell></TableRow>)}</TableBody></Table></div>:<p className="panel-note">No codes yet.</p>}</section></>;
}
