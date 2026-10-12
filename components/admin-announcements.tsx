'use client';
import {useState} from 'react';
import {Megaphone,Send} from 'lucide-react';
import {toast} from 'sonner';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {api,useAPI,Busy,Confirm,ErrorBox,Field,Loading,Pick} from './shared';
import type {AdminTemplateRow} from '@/lib/api-types';

// Announcements (V36) and new-template emails (V29): to customers who opted in to news, in Albanian and English.
type Announcement={id:string;subject:string;subjectEn:string;status:string;total:number;sent:number;createdAt:number;finishedAt:number|null;by:string|null};
const empty={subjectSq:'',bodySq:'',subjectEn:'',bodyEn:'',link:'',linkLabelSq:'',linkLabelEn:'',templateId:''};
export function AnnouncementsPanel(){
 const {data,error,loading,refresh}=useAPI<{audience:number;announcements:Announcement[]}>('admin/announcements');
 const templates=useAPI<{templates:AdminTemplateRow[]}>('admin/templates');
 const [form,setForm]=useState(empty),[busy,setBusy]=useState(false);
 const set=(k:keyof typeof empty)=>(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setForm(f=>({...f,[k]:e.target.value}));
 const live=(templates.data?.templates||[]).filter(t=>t.active);
 function announceTemplate(id:string){const t=live.find(x=>x.id===id);if(!t)return;setForm({templateId:t.id,link:'/template/'+t.slug,subjectSq:`E re: ${t.name}`,bodySq:`Kemi një shabllon të ri: ${t.name}.\n\n${t.description}\n\nZgjidhe, ngarko një foto dhe bëje tëndin.`,linkLabelSq:'Provoje tani',subjectEn:`New: ${t.name}`,bodyEn:`We have a new template: ${t.name}.\n\n${t.description}\n\nPick it, upload a photo and make it yours.`,linkLabelEn:'Try it now'});}
 async function run(path:string,done:(r:{total?:number})=>string){setBusy(true);try{const payload={...form,templateId:form.templateId||undefined};const r=await api<{total?:number}>(path,'POST',payload);toast.success(done(r));if(path==='admin/announcements'){setForm(empty);await refresh()}}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 if(loading||!data)return error?<ErrorBox message={error} retry={refresh}/>:<Loading/>;
 const ready=form.subjectSq.trim().length>=3&&form.bodySq.trim().length>=10&&form.subjectEn.trim().length>=3&&form.bodyEn.trim().length>=10;
 return <><div className="admin-heading"><div><span className="eyebrow">MARKETING</span><h1>Announcements</h1><p>Email news, offers and new templates to the {data.audience} customer{data.audience===1?'':'s'} who agreed to receive them. Each customer gets the version in their language, with an unsubscribe link.</p></div></div>
  <div className="admin-two-columns"><section className="panel"><h2><Megaphone size={19}/> New announcement</h2>
   {live.length>0&&<Field label="Announce a template (optional)" hint="Fills in a ready-made message you can edit."><Pick label="Announce a template" value={form.templateId} onChange={announceTemplate} options={live.map(t=>({value:t.id,label:t.name}))}/></Field>}
   <h3 className="lang-head">Shqip</h3><Field label="Subject"><input value={form.subjectSq} maxLength={150} onChange={set('subjectSq')}/></Field><Field label="Message" hint="Leave an empty line between paragraphs."><textarea rows={6} maxLength={5000} value={form.bodySq} onChange={set('bodySq')}/></Field><Field label="Button text"><input value={form.linkLabelSq} maxLength={60} onChange={set('linkLabelSq')} placeholder="Shiko tani"/></Field>
   <h3 className="lang-head">English</h3><Field label="Subject"><input value={form.subjectEn} maxLength={150} onChange={set('subjectEn')}/></Field><Field label="Message"><textarea rows={6} maxLength={5000} value={form.bodyEn} onChange={set('bodyEn')}/></Field><Field label="Button text"><input value={form.linkLabelEn} maxLength={60} onChange={set('linkLabelEn')} placeholder="See it now"/></Field>
   <Field label="Button link (optional)" hint="A page of the studio, e.g. /explore or /template/formula-driver."><input value={form.link} maxLength={200} onChange={set('link')} placeholder="/explore"/></Field>
   <div className="button-row"><button className="button secondary small" disabled={busy||!ready} onClick={()=>run('admin/announcements/test',()=>'Test sent to your email in both languages')}><Send size={15}/>Send me a test</button>
    <Confirm title={`Send to ${data.audience} customer${data.audience===1?'':'s'}?`} description="The emails go out over the next minutes and can be stopped while sending. They can't be recalled once delivered." onConfirm={()=>run('admin/announcements',r=>`Sending to ${r.total} customers`)}><button className="button primary small" disabled={busy||!ready||!data.audience}>{busy?<Busy/>:`Send to ${data.audience} customer${data.audience===1?'':'s'}`}</button></Confirm></div>
  </section>
  <section className="panel"><h2>Sent</h2>{data.announcements.length?<Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Progress</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.announcements.map(a=><TableRow key={a.id}><TableCell><strong>{a.subject}</strong><small className="block">{new Date(a.createdAt).toLocaleString()}{a.by?' · '+a.by:''}</small></TableCell><TableCell><span className={'status '+(a.status==='sent'?'completed':a.status==='cancelled'?'failed':'pending')}>{a.status==='sent'?'Sent':a.status==='cancelled'?'Stopped':'Sending'}</span><small className="block">{a.sent} of {a.total}</small></TableCell><TableCell>{a.status==='sending'&&<button className="text-button" onClick={async()=>{try{await api('admin/announcements/'+a.id+'/cancel','POST',{});toast.success('Stopped');await refresh()}catch(e){toast.error((e as Error).message)}}}>Stop</button>}</TableCell></TableRow>)}</TableBody></Table>:<p className="panel-note">Nothing sent yet.</p>}</section></div>
 </>;
}
