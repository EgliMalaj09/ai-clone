'use client';
import type {ReportsPage,ReportDetail,StudioSettings} from '@/lib/api-types';
import {useState} from 'react';
import {toast} from 'sonner';
import {AlertTriangle,ArrowRight,CheckCircle2,Flag,ShieldAlert,X} from 'lucide-react';
import {api,useAPI,Busy,ErrorBox,Loading,Empty,Pick,date} from './shared';
import {Pager} from './admin-operations';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from './ui/table';

export const reasonLabel:Record<string,string>={wrong_face:'Wrong face',glitches:'Glitches or artifacts',mismatch:'Doesn’t match the template',other:'Other'};
export function reportStatusLabel(r:{status:string;resolution:string|null}){
 if(r.status==='open')return 'Under review';
 if(r.status==='approved')return 'Approved – free redo';
 return r.resolution==='photo_unsuitable'?'Not approved – photo not suitable':'Not approved';
}

function CaseDetail({id,onResolved}:{id:string;onResolved:()=>void}){
 const {data,error,loading,refresh}=useAPI<ReportDetail>('admin/reports/'+id);
 const settings=useAPI<StudioSettings>('admin/settings');
 const [guideline,setGuideline]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);
 if(loading||!data)return error?<ErrorBox message={error} retry={refresh}/>:<Loading/>;
 const r=data.report,open=r.status==='open';
 const guidelineOptions=[...(settings.data?.photoGuidelines.dont||[]),...(settings.data?.photoGuidelines.do||[])];
 async function act(body:Record<string,unknown>,done:string){setBusy(true);try{await api('admin/reports/'+id+'/resolve','POST',body);toast.success(done);onResolved();await refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel report-detail">
  <div className="panel-heading"><h2>{data.templateName}</h2><span className={'status '+(open?'pending':r.status==='approved'?'completed':'failed')}>{reportStatusLabel(r)}</span></div>
  {r.flagged&&<div className="subtle-note report-flag"><ShieldAlert size={18}/><span>This customer has {r.userReportCount} reports. Review carefully for abuse.</span></div>}
  <div className="report-evidence">
   <div><h3>Finished video</h3>{data.video?<video src={data.video} controls playsInline preload="none"/>:<p className="small">Video unavailable.</p>}</div>
   <div><h3>Uploaded photo{data.photos.length>1?'s':''}</h3><div className="report-photos">{data.photos.map((src,i)=><img key={i} src={src} alt={'Uploaded photo '+(i+1)}/>)}</div></div>
  </div>
  <div className="report-meta"><div><span className="eyebrow">CUSTOMER</span><strong>{r.email||'Deleted account'}</strong></div><div><span className="eyebrow">REASON</span><strong>{reasonLabel[r.reason]||r.reason}</strong></div><div><span className="eyebrow">REPORTED</span><strong>{date(r.createdAt)}</strong></div></div>
  {r.comment&&<p className="report-comment">“{r.comment}”</p>}
  {data.redo&&<p className="subtle-note">Free redo started — creation {data.redo.id.slice(-8).toUpperCase()} ({data.redo.status}).</p>}
  {r.resolution==='photo_unsuitable'&&r.guideline&&<p className="subtle-note">Rejected: photo not suitable — {r.guideline}.</p>}
  {r.resolution==='other'&&r.adminReason&&<p className="subtle-note">Rejected: {r.adminReason}.</p>}
  {open&&<div className="report-actions">
   <div className="report-action"><h3><CheckCircle2 size={17}/> Good photo, generation problem</h3><p>Starts one free redo of the same video with the same photo, at no credit cost.</p><button className="button primary small" disabled={busy} onClick={()=>act({decision:'approve'},'Free redo started')}>{busy?<Busy/>:<>Approve free redo<ArrowRight size={15}/></>}</button></div>
   <div className="report-action"><h3><X size={17}/> Photo not suitable</h3><p>No free redo. The customer sees which guideline was not met.</p><Pick label="Which guideline" value={guideline} onChange={setGuideline} options={[{value:'',label:'Choose a guideline…'},...guidelineOptions.map(g=>({value:g,label:g}))]}/><button className="button secondary small" disabled={busy||!guideline} onClick={()=>act({decision:'reject_photo',guideline},'Report rejected')}>Reject – photo not suitable</button></div>
   <div className="report-action"><h3><AlertTriangle size={17}/> Other</h3><p>A short reason the customer will see.</p><textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason shown to the customer"/><button className="button secondary small" disabled={busy||!reason.trim()} onClick={()=>act({decision:'reject_other',reason},'Report rejected')}>Reject – other</button></div>
  </div>}
 </section>;
}

type RemovalRequest={id:string;videoReference:string;name:string;email:string;relation:string;details:string;status:string;adminNote:string|null;createdAt:number;resolvedAt:number|null;video:{generationId:string;templateName:string;thumbnail:string;ownerEmail:string|null;url:string|null}|null};
const relationLabel:Record<string,string>={self:'The person in the video',representative:'Someone acting for them',other:'Someone else'};
/** Removal requests (V30): people shown in a video without agreeing. A shared video named in the request is already hidden. */
function RemovalsPanel(){
 const [status,setStatus]=useState('open'),[page,setPage]=useState(1),[open,setOpen]=useState<string|null>(null),[note,setNote]=useState(''),[gid,setGid]=useState(''),[busy,setBusy]=useState(false);
 const {data,error,loading,refresh}=useAPI<{requests:RemovalRequest[];pagination:{page:number;limit:number;total:number;pages:number}}>('admin/removals?status='+status+'&page='+page);
 async function resolve(id:string,decision:'remove'|'keep'){setBusy(true);try{await api('admin/removals/'+id+'/resolve','POST',{decision,note,...(gid?{generationId:gid}:{})});toast.success(decision==='remove'?'Video removed; both people were emailed':'Request closed; the requester was emailed');setOpen(null);setNote('');setGid('');await refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <><div className="admin-toolbar"><Pick label="Filter removal requests" value={status} onChange={v=>{setStatus(v);setPage(1);setOpen(null)}} options={[{value:'open',label:'Open'},{value:'removed',label:'Removed'},{value:'kept',label:'Kept'},{value:'all',label:'All'}]}/></div>
  {loading?<Loading/>:error?<ErrorBox message={error} retry={refresh}/>:!data?.requests.length?<Empty title="No removal requests here." description="Requests from people who appear in a video without agreeing will appear here."><span/></Empty>:
  <div className="removal-list">{data.requests.map(r=><section className="panel" key={r.id}><div className="panel-heading"><h2>{r.video?r.video.templateName:'Video not identified'}</h2><span className={'status '+(r.status==='open'?'pending':r.status==='removed'?'completed':'failed')}>{r.status==='open'?'Open':r.status==='removed'?'Removed':'Kept'}</span></div>
   <p><strong>{r.name}</strong> · <a href={'mailto:'+r.email}>{r.email}</a> · {relationLabel[r.relation]||r.relation} · {date(r.createdAt)}</p><p className="removal-details">{r.details}</p><p className="panel-note">Link or description: {r.videoReference}{r.video?' · Owner: '+(r.video.ownerEmail||'deleted account')+' · Share page already hidden':''}</p>
   {r.video?.url&&<video className="removal-video" src={r.video.url} controls playsInline preload="none" poster={r.video.thumbnail}/>}
   {r.status==='open'?(open===r.id?<div className="removal-actions">{!r.video&&<label className="field"><span>Creation ID of the video (from Generations)</span><input value={gid} onChange={e=>setGid(e.target.value.trim())} placeholder="gen_…"/></label>}<label className="field"><span>Note to the requester (optional, sent when keeping the video)</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label><div className="button-row"><button className="button primary small" disabled={busy||(!r.video&&!gid)} onClick={()=>resolve(r.id,'remove')}>{busy?<Busy/>:'Remove the video'}</button><button className="button secondary small" disabled={busy} onClick={()=>resolve(r.id,'keep')}>Keep it</button><button className="text-button" onClick={()=>setOpen(null)}>Cancel</button></div></div>:<button className="button secondary small" onClick={()=>{setOpen(r.id);setNote('');setGid('')}}>Decide</button>):r.adminNote&&<p className="panel-note">Note: {r.adminNote}</p>}
  </section>)}</div>}
  <Pager pagination={data?.pagination} onPage={setPage}/></>;
}

export function ReportsPanel(){
 const [view,setView]=useState<'reports'|'removals'>('reports');
 const [status,setStatus]=useState('open');const [page,setPage]=useState(1);const [selected,setSelected]=useState<string|null>(null);
 const {data,error,loading,refresh}=useAPI<ReportsPage>('admin/reports?status='+status+'&page='+page);
 return <><div className="admin-heading"><div><span className="eyebrow">CUSTOMER CARE</span><h1>Reports</h1><p>Review reported videos. Approve one free redo when the photo was good; otherwise explain why. Removal requests come from people shown in a video without agreeing.</p></div></div>
  <div className="segmented" role="tablist"><button role="tab" aria-selected={view==='reports'} className={view==='reports'?'active':''} onClick={()=>setView('reports')}>Video reports</button><button role="tab" aria-selected={view==='removals'} className={view==='removals'?'active':''} onClick={()=>setView('removals')}>Removal requests</button></div>
  {view==='removals'?<RemovalsPanel/>:<>
  <div className="admin-toolbar"><Pick label="Filter reports" value={status} onChange={v=>{setStatus(v);setPage(1);setSelected(null)}} options={[{value:'open',label:'Open'},{value:'approved',label:'Approved'},{value:'rejected',label:'Rejected'},{value:'all',label:'All'}]}/></div>
  {loading?<Loading/>:error?<ErrorBox message={error} retry={refresh}/>:!data?.reports.length?<Empty title="No reports here." description="Reported videos will appear here for review."><span/></Empty>:
  <div className="table-panel"><Table><TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Customer</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Reported</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.reports.map(r=><TableRow key={r.id}><TableCell><div className="table-template"><img src={r.thumbnail} alt=""/><strong>{r.templateName}</strong></div></TableCell><TableCell>{r.email||'Deleted account'}{r.flagged&&<Flag size={14} className="report-flag-icon"/>}</TableCell><TableCell>{reasonLabel[r.reason]||r.reason}</TableCell><TableCell><span className={'status '+(r.status==='open'?'pending':r.status==='approved'?'completed':'failed')}>{reportStatusLabel(r)}</span></TableCell><TableCell>{date(r.createdAt)}</TableCell><TableCell><button className="button secondary small" onClick={()=>setSelected(r.id===selected?null:r.id)}>{r.id===selected?'Hide':'Review'}</button></TableCell></TableRow>)}</TableBody></Table></div>}
  <Pager pagination={data?.pagination} onPage={setPage}/>
  {selected&&<CaseDetail id={selected} onResolved={refresh}/>}
  </>}
 </>;
}
