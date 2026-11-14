'use client';
// One page per customer: profile, credits, purchases, creations and activity, with every action an administrator can take.
import {useState} from 'react';
import {ArrowLeft,BadgeCheck,Ban,KeyRound,RotateCcw,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {api,useAPI,Busy,Confirm,ErrorBox,Field,Loading,date} from './shared';
import {Pager} from './admin-operations';
import {AdjustCredits,ReversePurchase,kindLabel,signed} from './admin-credits';
import {credits,money,statusLabel} from '@/lib/contracts';
import type {AdminUserDetail,CreditHistory,CreditPurchase,Pagination} from '@/lib/api-types';
import {isStaff,type StudioUser} from '@/lib/contracts';

const megabytes=(bytes:number)=>(bytes/1048576).toFixed(1)+' MB';
const actionLabel=(a:string)=>({'user.suspended':'Suspended','user.active':'Reactivated','user.rename':'Name changed','user.verify-email':'Email marked as verified','user.delete':'Deleted','credits.adjust':'Credits adjusted','credits.reverse-purchase':'Purchase reversed','user.blocked':'Blocked after 3 content refusals','user.unblock':'Unblocked (refusals reset)','user.reset-link':'Password reset link sent','account.2fa-enabled':'Two-step sign-in turned on','account.2fa-disabled':'Two-step sign-in turned off','account.password-changed':'Password changed','account.exported':'Downloaded their data','user.role-user':'Role set to customer','user.role-support':'Role set to support','user.role-admin':'Role set to administrator'} as Record<string,string>)[a]||a;

export default function UserDetail({id,viewer}:{id:string;viewer?:StudioUser|null}){
 const {data,error,loading,refresh}=useAPI<AdminUserDetail>('admin/users/'+id);
 const [historyPage,setHistoryPage]=useState(1),[purchasePage,setPurchasePage]=useState(1);
 const history=useAPI<CreditHistory>(`admin/users/${id}/credits?page=${historyPage}`);
 const purchases=useAPI<{purchases:CreditPurchase[];pagination:Pagination}>(`admin/users/${id}/purchases?page=${purchasePage}`);
 const [name,setName]=useState<string|null>(null),[busy,setBusy]=useState(false),[role,setRole]=useState<string|null>(null),[rolePassword,setRolePassword]=useState('');const viewerIsAdmin=viewer?.role==='admin';
 if(loading||!data)return error?<ErrorBox message={error} retry={refresh}/>:<Loading/>;
 const {user}=data,isAdmin=isStaff(user.role);
 const reloadAll=()=>{void refresh();void history.refresh();void purchases.refresh();};
 async function update(change:Record<string,unknown>,done:string){setBusy(true);try{await api('admin/users/'+id,'PATCH',change);toast.success(done);setName(null);reloadAll()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <>
  <a className="back-link" href="/admin/users"><ArrowLeft size={15}/>All customers</a>
  <div className="admin-heading"><div><span className="eyebrow">CUSTOMER</span><h1>{user.name}</h1><p>{user.email}</p>
   <div className="badge-row"><span className={'status '+(user.status==='active'?'completed':'failed')}>{user.status==='active'?'Active':'Suspended'}</span><span className={'status '+(user.email_verified?'completed':'pending')}>{user.email_verified?'Email verified':'Email not verified'}</span>{isAdmin&&<span className="status pending">{user.role==='support'?'Support':'Administrator'}</span>}{user.two_factor&&<span className="status completed">Two-step sign-in on</span>}<span className="status">Emails in {user.locale==='en'?'English':'Albanian'}</span>{user.blocked_at?<span className="status blocked">Blocked: 3 content refusals</span>:user.content_strikes>0&&<span className="status pending">Content refusals: {user.content_strikes} of 3</span>}</div></div>
   <div className="button-row">
    {(user.blocked_at||user.content_strikes>0)&&<button className="button secondary small" disabled={busy} onClick={()=>update({unblock:true},user.blocked_at?'Customer unblocked':'Refusals reset')}><RotateCcw size={16}/>{user.blocked_at?'Unblock':'Reset refusals'}</button>}
    {!user.email_verified&&<button className="button secondary small" disabled={busy} onClick={()=>update({emailVerified:true},'Email marked as verified')}><BadgeCheck size={16}/>Mark email verified</button>}
    {user.status==='active'&&<Confirm title={'Send '+user.name+' a password reset link?'} description="They get an email with a link that works for 30 minutes. Their current password keeps working until they choose a new one." onConfirm={async()=>{const r=await api<{sent:boolean;url?:string}>('admin/users/'+id+'/reset-link','POST',{});if(r.url){await navigator.clipboard?.writeText(r.url).catch(()=>{});toast.success('Demo studio: no email is sent. The reset link was copied: '+r.url)}else toast.success('Password reset link sent');reloadAll()}}><button className="button secondary small" disabled={busy}><KeyRound size={16}/>Send reset link</button></Confirm>}
    {!isAdmin&&viewerIsAdmin&&<button className="button secondary small" disabled={busy} onClick={()=>update({status:user.status==='active'?'suspended':'active'},user.status==='active'?'Customer suspended':'Customer reactivated')}>{user.status==='active'?<><Ban size={16}/>Suspend</>:<><RotateCcw size={16}/>Reactivate</>}</button>}
    {!isAdmin&&viewerIsAdmin&&<Confirm title={'Delete '+user.name+'?'} description="The account, its personal files and its credit balance will be permanently removed. Purchase and ledger records are kept without the account link." onConfirm={async()=>{await api('admin/users/'+id,'DELETE');toast.success('Customer deleted');window.location.assign('/admin/users')}}><button className="button danger-outline small"><Trash2 size={16}/>Delete</button></Confirm>}
   </div></div>

  <div className="metric-grid">
   <div className="metric-card"><div><span>Available credits</span></div><strong>{credits(data.balance.available)}</strong><p>{credits(data.balance.held)} reserved by running videos</p></div>
   <div className="metric-card"><div><span>Creations</span></div><strong>{data.creations.total}</strong><p>{data.creations.completed} completed · {data.creations.failed} failed</p></div>
   <div className="metric-card"><div><span>Joined</span></div><strong>{date(user.created_at)}</strong><p>{data.sessions.lastSignIn?'Last sign-in '+date(data.sessions.lastSignIn):'Not signed in recently'} · {data.sessions.active} active sign-in{data.sessions.active===1?'':'s'}</p></div>
   <div className="metric-card"><div><span>Uploaded photos</span></div><strong>{data.uploads.count}</strong><p>{megabytes(data.uploads.bytes)} stored</p></div>
  </div>

  <div className="user-columns">
   <section className="panel"><h2>Profile</h2>
    <form onSubmit={e=>{e.preventDefault();if(name!==null)void update({name},'Name updated')}}>
     <Field label="Name"><input value={name??user.name} minLength={2} maxLength={80} required onChange={e=>setName(e.target.value)}/></Field>
     <Field label="Email address" hint="The email address can't be changed here."><input value={user.email} readOnly/></Field>
     <button className="button primary small" disabled={busy||!viewerIsAdmin||name===null||name.trim()===user.name}>{busy?<Busy/>:'Save name'}</button>
    </form>
    {viewerIsAdmin&&viewer?.id!==user.id&&<form className="role-form" onSubmit={e=>{e.preventDefault();if(role&&role!==user.role)void update({role,currentPassword:rolePassword},'Role updated').then(()=>{setRole(null);setRolePassword('')})}}><h3>Role</h3><p className="panel-note">Support can look after customers (users, creations, reports, operations) but not money, keys, settings or templates. Administrators can do everything. Changing the role signs the account out.</p>
     <Field label="Role"><select value={role??user.role} onChange={e=>setRole(e.target.value)}><option value="user">Customer</option><option value="support">Support</option><option value="admin">Administrator</option></select></Field>
     {role&&role!==user.role&&<Field label="Your administrator password"><input type="password" autoComplete="current-password" required value={rolePassword} onChange={e=>setRolePassword(e.target.value)}/></Field>}
     <button className="button secondary small" disabled={busy||!role||role===user.role||!rolePassword}>Change role</button></form>}
   </section>
   <section className="panel"><div className="panel-heading"><h2>Credits</h2><AdjustCredits userId={user.id} name={user.name} balance={data.balance.available} onDone={reloadAll}/></div>
    {history.loading?<Loading rows={2}/>:history.error||!history.data?<ErrorBox message={history.error} retry={history.refresh}/>:history.data.transactions.length?<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Change</TableHead><TableHead>Balance</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{history.data.transactions.map(t=><TableRow key={t.id}>
     <TableCell>{date(t.created_at)}</TableCell><TableCell>{kindLabel(t.kind)}</TableCell>
     <TableCell className={t.available_change>0?'profit-positive':t.available_change<0?'profit-negative':''}>{t.available_change?signed(t.available_change):t.held_change<0?credits(-t.held_change)+' charged':'—'}</TableCell>
     <TableCell>{t.available_after===null?'—':credits(t.available_after)}</TableCell><TableCell>{t.reason||''}</TableCell></TableRow>)}</TableBody></Table>:<p className="panel-note">No credit activity yet.</p>}
    {!!history.data?.transactions.length&&<Pager pagination={history.data.pagination} onPage={setHistoryPage}/>}
   </section>
  </div>

  {data.refusals.length>0&&<section className="panel"><h2>Refused by content rules</h2><p className="panel-note">Photos the AI provider refused. If they were flagged by mistake (e.g. swimwear or sports), unblock the account above; that also resets the count.</p>
   <div className="refusal-list">{data.refusals.map(r=><div className="refusal-item" key={r.id}><div className="refusal-photos">{r.photos.length?r.photos.map(src=><a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Refused photo"/></a>):<span className="panel-note">Photo deleted by the customer</span>}</div><div><strong>{r.template_name}</strong><small className="block">{new Date(r.created_at).toLocaleString()}</small>{r.reason&&<small className="block">{r.reason}</small>}</div></div>)}</div>
  </section>}
  {data.reports.length>0&&<section className="panel"><div className="panel-heading"><h2>Reports</h2><a className="text-link" href="/admin/reports">Reports queue</a></div><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Video</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.reports.map(r=><TableRow key={r.id}><TableCell>{date(r.created_at)}</TableCell><TableCell>{r.template_name}</TableCell><TableCell>{r.reason.replaceAll('_',' ')}</TableCell><TableCell><span className={'status '+(r.status==='approved'?'completed':r.status==='rejected'?'failed':'pending')}>{r.status==='open'?'Under review':r.status==='approved'?'Approved (free redo)':r.resolution==='photo_unsuitable'?'Rejected: photo not suitable':'Rejected'}</span></TableCell></TableRow>)}</TableBody></Table></section>}
  <section className="panel"><h2>Credit purchases</h2>
   {purchases.loading?<Loading rows={2}/>:purchases.error||!purchases.data?<ErrorBox message={purchases.error} retry={purchases.refresh}/>:purchases.data.purchases.length?<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Pack</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{purchases.data.purchases.map(p=><TableRow key={p.id}>
    <TableCell>{date(p.createdAt)}</TableCell><TableCell>{p.packageName}<small className="block">{credits(p.credits)}</small></TableCell><TableCell>{money(p.amount,p.currency)}</TableCell>
    <TableCell><span className={'status '+(p.status==='paid'?'completed':p.status==='reversed'?'failed':'pending')}>{statusLabel(p.status)}</span></TableCell>
    <TableCell>{p.status==='paid'&&<ReversePurchase purchase={{...p,email:user.email}} onDone={reloadAll}/>}</TableCell></TableRow>)}</TableBody></Table>:<p className="panel-note">No purchases yet.</p>}
   {!!purchases.data?.purchases.length&&<Pager pagination={purchases.data.pagination} onPage={setPurchasePage}/>}
  </section>

  <section className="panel"><div className="panel-heading"><h2>Creations</h2><a className="text-link" href={'/admin/generations?user='+encodeURIComponent(user.email)}>View all</a></div>
   {data.creations.recent.length?<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Credits</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{data.creations.recent.map(g=><TableRow key={g.id}>
    <TableCell>{date(g.created_at)}</TableCell><TableCell>{g.template_name}</TableCell><TableCell><span className={'status '+g.status}>{statusLabel(g.status)}</span></TableCell>
    <TableCell>{credits(g.credit_cost)}{g.credit_status&&<small className="block">{statusLabel(g.credit_status)}</small>}</TableCell><TableCell>{g.error||''}</TableCell></TableRow>)}</TableBody></Table>:<p className="panel-note">No creations yet.</p>}
  </section>

  <section className="panel"><h2>Activity</h2>
   {data.activity.length?<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Action</TableHead><TableHead>By</TableHead></TableRow></TableHeader><TableBody>{data.activity.map(a=><TableRow key={a.id}><TableCell>{new Date(a.created_at).toLocaleString()}</TableCell><TableCell>{actionLabel(a.action)}</TableCell><TableCell>{a.actor_email||'—'}</TableCell></TableRow>)}</TableBody></Table>:<p className="panel-note">No recorded activity yet.</p>}
  </section>
 </>;
}
