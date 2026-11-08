'use client';
import {useState} from 'react';
import {Coins,Download,Pencil,Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Switch} from '@/components/ui/switch';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {api,useAPI,Busy,Confirm,ErrorBox,Field,Loading,Pick,date} from './shared';
import {Pager,RecordSearch} from './admin-operations';
import {PRICING_RESOLUTIONS,credits,lengthCredits,money,percentOff,singleVideoAmount,statusLabel,type Pricing} from '@/lib/contracts';
import type {CreditHistory,CreditPackage,CreditPurchase,Pagination} from '@/lib/api-types';

// POK charges in these currencies only.
const currencies=['ALL','EUR'];
const kinds:[string,string][]=[['all','All types'],['purchase','Purchases'],['hold','Reserved'],['capture','Spent'],['release','Returned'],['adjust','Adjustments'],['welcome','Welcome'],['goodwill','Free redos'],['promo','Promo codes'],['referral','Referrals'],['gift_sale','Gifts bought'],['gift','Gifts redeemed'],['reversal','Reversals']];
export const kindLabel=(k:string)=>kinds.find(([v])=>v===k)?.[1].replace(/s$/,'')||k;
function Heading({title,description,children}:{title:string;description:string;children?:React.ReactNode}){return <div className="admin-heading"><div><span className="eyebrow">CREDITS</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;}
export const signed=(n:number)=>(n>0?'+':n<0?'−':'')+credits(Math.abs(n));

type PackForm={id:string|null;name:string;credits:number;bonusCredits:number;active:boolean;sortOrder:number;prices:Record<string,string>};
const emptyPack=():PackForm=>({id:null,name:'',credits:500,bonusCredits:0,active:true,sortOrder:0,prices:{EUR:'4.99'}});
export function CreditPacks(){
 const {data,error,loading,refresh}=useAPI<{packages:CreditPackage[]}>('admin/credit-packages');const [form,setForm]=useState<PackForm|null>(null),[busy,setBusy]=useState(false);
 async function save(e:React.FormEvent){e.preventDefault();if(!form)return;setBusy(true);try{
  const prices=Object.fromEntries(Object.entries(form.prices).filter(([,v])=>v.trim()!=='').map(([c,v])=>[c,Math.round(Number(v)*100)]));
  const body={name:form.name,credits:form.credits,bonusCredits:form.bonusCredits,active:form.active,sortOrder:form.sortOrder,prices};
  await api('admin/credit-packages'+(form.id?'/'+form.id:''),form.id?'PATCH':'POST',body);setForm(null);await refresh();toast.success('Credit pack saved');
 }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <><Heading title="Credit packs" description="What customers can buy. Purchases keep the pack as it was when bought, so edits never change past purchases.">{!form&&<button className="button primary small" onClick={()=>setForm(emptyPack())}><Plus size={16}/>New pack</button>}</Heading>
  {form&&<section className="panel"><h2>{form.id?'Edit pack':'New pack'}</h2><form onSubmit={save} className="admin-form-grid">
   <Field label="Name"><input required minLength={2} maxLength={60} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
   <Field label="Credits"><input type="number" required min={1} value={form.credits} onChange={e=>setForm({...form,credits:Number(e.target.value)})}/></Field>
   <Field label="Bonus credits" hint="Shown as a bonus on the pack."><input type="number" min={0} value={form.bonusCredits} onChange={e=>setForm({...form,bonusCredits:Number(e.target.value)})}/></Field>
   <Field label="Display order"><input type="number" min={0} value={form.sortOrder} onChange={e=>setForm({...form,sortOrder:Number(e.target.value)})}/></Field>
   {currencies.map(c=><Field key={c} label={'Price in '+c} hint="Leave empty to not sell in this currency."><input type="number" step="0.01" min="0.50" value={form.prices[c]??''} onChange={e=>setForm({...form,prices:{...form.prices,[c]:e.target.value}})}/></Field>)}
   <label className="switch-row"><span>On sale</span><Switch aria-label="Pack on sale" checked={form.active} onCheckedChange={v=>setForm({...form,active:v})}/></label>
   <div className="button-row"><button className="button primary small" disabled={busy}>{busy?<Busy/>:'Save pack'}</button><button type="button" className="button secondary small" onClick={()=>setForm(null)}>Cancel</button></div>
  </form></section>}
  {loading?<Loading/>:error||!data?<ErrorBox message={error} retry={refresh}/>:<div className="table-panel"><Table><TableHeader><TableRow><TableHead>Pack</TableHead><TableHead>Credits</TableHead><TableHead>Prices</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.packages.map(p=><TableRow key={p.id}>
   <TableCell><strong>{p.name}</strong></TableCell><TableCell>{credits(p.totalCredits)}{p.bonusCredits>0&&<small className="block">{credits(p.credits)} + {credits(p.bonusCredits)} bonus</small>}</TableCell>
   <TableCell>{Object.entries(p.prices).map(([c,v])=><span className="block" key={c}>{money(v,c)}</span>)}</TableCell>
   <TableCell><span className={'status '+(p.active?'completed':'pending')}>{p.active?'On sale':'Hidden'}</span></TableCell>
   <TableCell><div className="table-actions"><button className="icon-button" aria-label={'Edit '+p.name} onClick={()=>setForm({id:p.id,name:p.name,credits:p.credits,bonusCredits:p.bonusCredits,active:p.active,sortOrder:p.sortOrder,prices:Object.fromEntries(Object.entries(p.prices).map(([c,v])=>[c,(v/100).toFixed(2)]))})}><Pencil size={16}/></button>
    <Confirm title={'Delete '+p.name+'?'} description="Customers can no longer buy it. Past purchases are not affected." onConfirm={async()=>{await api('admin/credit-packages/'+p.id,'DELETE');await refresh();toast.success('Pack deleted')}}><button className="icon-button danger" aria-label={'Delete '+p.name}><Trash2 size={16}/></button></Confirm></div></TableCell>
  </TableRow>)}</TableBody></Table>{!data.packages.length&&<div className="small-empty"><Coins/><p>No packs yet. Customers cannot buy credits until you add one.</p></div>}</div>}</>;
}

export function PurchaseManager(){
 const [page,setPage]=useState(1);const {data,error,loading,refresh}=useAPI<{purchases:CreditPurchase[];pagination:Pagination}>('admin/credits/purchases?page='+page);
 return <><Heading title="Credit purchases" description="Every pack bought, with its payment status. A reversed purchase is a refund or chargeback made in POK. POK does not report these, so record each one with Reverse."><a className="button secondary small" href="/api/admin/export/purchases" download><Download size={16}/>Export CSV</a></Heading>
  {loading?<Loading/>:error||!data?<ErrorBox message={error} retry={refresh}/>:<div className="table-panel"><Table><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Pack</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{data.purchases.map(p=><TableRow key={p.id}>
   <TableCell>{p.email||'Deleted account'}<small className="block mono">{p.id.slice(-10)}</small></TableCell><TableCell>{p.packageName}<small className="block">{credits(p.credits)}</small></TableCell>
   <TableCell>{money(p.amount,p.currency)}<small className="block">{p.provider==='mock'?'Test checkout':p.provider==='pok'?'POK':p.provider}</small></TableCell><TableCell><span className={'status '+(p.status==='paid'?'completed':p.status==='reversed'?'failed':'pending')}>{statusLabel(p.status)}</span></TableCell><TableCell>{date(p.createdAt)}</TableCell><TableCell>{p.status==='paid'&&<ReversePurchase purchase={p} onDone={refresh}/>}</TableCell>
  </TableRow>)}</TableBody></Table>{!data.purchases.length&&<div className="small-empty"><p>No purchases yet.</p></div>}</div>}<Pager pagination={data?.pagination} onPage={setPage}/></>;
}

export function CreditLedger({initialSearch=''}:{initialSearch?:string}){
 const [page,setPage]=useState(1),[search,setSearch]=useState(initialSearch),[kind,setKind]=useState('all');
 const {data,error,loading,refresh}=useAPI<CreditHistory>('admin/credits/ledger?'+new URLSearchParams({page:String(page),search,kind}));
 const reconciliation=useAPI<{ok:boolean;negative:unknown[]}>('admin/credits/reconciliation');
 return <><Heading title="Credit ledger" description="Every credit change, newest first. Entries are permanent; corrections are new entries."><a className="button secondary small" href="/api/admin/export/ledger" download><Download size={16}/>Export CSV</a></Heading>
  {reconciliation.data&&<div className={'subtle-note '+(reconciliation.data.ok?'':'readiness-warning')}>{reconciliation.data.ok?'Balances match the ledger.':'Ledger mismatch found. Review Operations.'}{reconciliation.data.negative.length>0&&` ${reconciliation.data.negative.length} account(s) are below zero after a reversed payment.`}</div>}
  <div className="admin-toolbar"><RecordSearch value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="Search email, transaction or reference ID"/><Pick label="Transaction type" value={kind} onChange={v=>{setKind(v);setPage(1)}} options={kinds.map(([value,label])=>({value,label}))}/></div>
  {loading?<Loading/>:error||!data?<ErrorBox message={error} retry={refresh}/>:<div className="table-panel"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Change</TableHead><TableHead>Balance after</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{data.transactions.map(t=><TableRow key={t.id}>
   <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell><TableCell>{t.email||'Deleted account'}</TableCell><TableCell>{kindLabel(t.kind)}</TableCell>
   <TableCell className={t.available_change>0?'profit-positive':t.available_change<0?'profit-negative':''}>{t.available_change?signed(t.available_change):t.held_change<0?credits(-t.held_change)+' charged':'—'}</TableCell>
   <TableCell>{t.available_after===null?'—':credits(t.available_after)}</TableCell><TableCell>{t.reason||t.reference_id||''}</TableCell>
  </TableRow>)}</TableBody></Table>{!data.transactions.length&&<div className="small-empty"><p>No matching transactions.</p></div>}</div>}<Pager pagination={data?.pagination} onPage={setPage}/></>;
}

/** Records a refund or chargeback made in POK: removes the pack's credits, even below zero. Requires the administrator password. */
export function ReversePurchase({purchase,onDone}:{purchase:CreditPurchase;onDone:()=>void}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState('Payment refunded'),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  await api(`admin/credits/purchases/${purchase.id}/reverse`,'POST',{reason,currentPassword:password});
  toast.success('Purchase reversed. Its credits were removed.');setOpen(false);setPassword('');onDone();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className="text-link">Reverse</button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Reverse this purchase?</DialogTitle><DialogDescription>Do this only after refunding {purchase.email||'the customer'} in POK, or when POK reports a chargeback. {credits(purchase.credits)} will be removed from their balance, even if it goes below zero. This cannot be undone.</DialogDescription></DialogHeader>
  <form onSubmit={submit}><Field label="Reason"><Pick label="Reason" value={reason} onChange={setReason} options={[{value:'Payment refunded',label:'Refunded in POK'},{value:'Payment disputed',label:'Chargeback or dispute'}]}/></Field><Field label="Your administrator password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>
   {error&&<ErrorBox message={error}/>}<button className="button primary small" disabled={busy||!password}>{busy?<Busy/>:'Reverse purchase'}</button></form>
 </DialogContent></Dialog>;
}

/** Add or remove credits for one customer. Requires a reason and the administrator password; recorded in the ledger and audit log. */
export function AdjustCredits({userId,name,balance,onDone}:{userId:string;name:string;balance:number;onDone:()=>void}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const r=await api<{available:number}>(`admin/users/${userId}/credits`,'POST',{amount:Number(amount),reason,currentPassword:password,idempotencyKey:crypto.randomUUID()});
  toast.success(`${name} now has ${credits(r.available)}`);setOpen(false);setAmount('');setReason('');setPassword('');onDone();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className="text-link">Adjust credits</button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Adjust credits for {name}</DialogTitle><DialogDescription>Current balance: {credits(balance)}. Use a negative number to remove credits; a removal cannot go below zero.</DialogDescription></DialogHeader>
  <form onSubmit={submit}><Field label="Credits (+ add, − remove)"><input type="number" required step={1} value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label="Reason" hint="Shown in the customer’s credit history."><input required minLength={3} maxLength={200} value={reason} onChange={e=>setReason(e.target.value)}/></Field><Field label="Your administrator password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>
   {error&&<ErrorBox message={error}/>}<button className="button primary small" disabled={busy||!amount||Number(amount)===0}>{busy?<Busy/>:'Save adjustment'}</button></form>
 </DialogContent></Dialog>;
}

export function WelcomeCredits({value,onSaved}:{value:number;onSaved:()=>void}){
 const [amount,setAmount]=useState(String(value)),[busy,setBusy]=useState(false);
 return <section className="panel"><h2>Welcome credits</h2><p>Credits given once to each new account after its email is verified. 0 turns this off.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api('admin/settings','PATCH',{welcomeCredits:Number(amount)});toast.success('Welcome credits updated');onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>
  <Field label="Credits per new account"><input type="number" min={0} max={100000} step={1} required value={amount} onChange={e=>setAmount(e.target.value)}/></Field><button className="button primary small" disabled={busy}>{busy?<Busy/>:'Save'}</button></form></section>;
}

/** V47: one free 480p video per verified customer account; turn off to stop new free videos (e.g. if it is abused). */
export function FreeTrialSetting({on,onSaved}:{on:boolean;onSaved:()=>void}){
 const [busy,setBusy]=useState(false);
 return <section className="panel"><h2>Free trial video</h2><p>Each verified customer can make one free video, rendered at 480p with no watermark, on the templates you mark “Free trial” (videos of 5 seconds or less). It costs you the AI price of that video. Turning this off stops new free videos; ones already started still finish.</p>
  <button className={'button small '+(on?'danger-outline':'primary')} disabled={busy} onClick={async()=>{setBusy(true);try{await api('admin/settings','PATCH',{freeTrial:!on});toast.success(on?'Free trial turned off':'Free trial turned on');onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>{busy?<Busy/>:on?'Turn off the free trial':'Turn on the free trial'}</button></section>;
}

/** Pricing by length, the single-video markup and the pack offer (Admin → Settings). */
export function PricingSettings({value,onSaved}:{value:Pricing;onSaved:()=>void}){
 const packs=useAPI<{packages:CreditPackage[]}>('admin/credit-packages');
 const [p,setP]=useState<Pricing>(value),[busy,setBusy]=useState(false);
 const active=(packs.data?.packages||[]).filter(x=>x.active);
 const cur=active.some(x=>x.prices.EUR)?'EUR':active.some(x=>x.prices.ALL)?'ALL':'';
 const priced=active.filter(x=>cur&&x.prices[cur]);
 const example=lengthCredits(5,5,'720p',p.perSecond);
 const dearest=priced.length?Math.max(...priced.map(x=>x.prices[cur]/x.totalCredits)):0;
 const single=dearest?singleVideoAmount(example,dearest*(1+p.singleMarkup/100),cur):0;
 const num=(v:string)=>Number(v.replace(',','.'));
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);try{const r=await api<{repriced:number}>('admin/settings','PATCH',{pricing:p});toast.success(r.repriced?`Pricing saved. ${r.repriced} template${r.repriced>1?'s':''} re-priced.`:'Pricing saved');onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel"><h2>Pricing</h2><p>Templates set to “Price by length” cost (video seconds + reference clip seconds) × the credits per second below. Saving re-prices them all.</p>
  <form onSubmit={save}><div className="form-grid">{PRICING_RESOLUTIONS.map(r=><Field key={r} label={'Credits per second, '+r}><input type="number" min={0.1} step={0.1} required value={p.perSecond[r]??''} onChange={e=>setP(v=>({...v,perSecond:{...v.perSecond,[r]:num(e.target.value)}}))}/></Field>)}</div>
   <Field label="Single video markup (%)" hint="Added to the dearest pack’s credit price when someone buys one video without a pack."><input type="number" min={0} max={300} step={1} required value={p.singleMarkup} onChange={e=>setP(v=>({...v,singleMarkup:Math.round(num(e.target.value))}))}/></Field>
   <label className="switch-row"><div><strong>Special pack offer</strong><small>A % off one pack, shown with an animated badge on the pack lists and when someone is about to buy a single video.</small></div><Switch checked={p.offer.enabled} onCheckedChange={on=>setP(v=>({...v,offer:{...v.offer,enabled:on,packageId:v.offer.packageId||priced[0]?.id||''}}))} aria-label="Special pack offer"/></label>
   {p.offer.enabled&&<div className="form-grid"><Field label="Pack on offer"><Pick label="Pack on offer" value={p.offer.packageId} onChange={id=>setP(v=>({...v,offer:{...v.offer,packageId:id}}))} options={active.map(x=>({value:x.id,label:x.name}))}/></Field><Field label="Discount (%)"><input type="number" min={1} max={90} step={1} required value={p.offer.percent} onChange={e=>setP(v=>({...v,offer:{...v.offer,percent:Math.round(num(e.target.value))}}))}/></Field></div>}
   {cur&&priced.length>0&&<div className="pricing-example"><strong>Example: a 5 s video with a 5 s reference clip at 720p = {credits(example)}</strong><ul>{priced.map(x=>{const off=p.offer.enabled&&p.offer.packageId===x.id?percentOff(x.prices[cur],p.offer.percent,cur):x.prices[cur];return <li key={x.id}><span>{x.name}: {Math.floor(x.totalCredits/example)} videos for {money(off,cur)}{off<x.prices[cur]&&<s> {money(x.prices[cur],cur)}</s>}</span><b>{money(Math.round(off/x.totalCredits*example),cur)} per video</b></li>})}<li><span>One video, no pack</span><b>{money(single,cur)}</b></li></ul></div>}
   <button className="button primary small" disabled={busy}>{busy?<Busy/>:'Save pricing'}</button></form></section>;
}
