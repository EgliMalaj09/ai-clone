'use client';
import {toast} from 'sonner';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {api,useAPI,ErrorBox,Loading,Pick,date} from './shared';
import type {AdminTemplateRow} from '@/lib/api-types';

// Template ideas from customers (V43), most voted first.
type AdminIdea={id:string;title:string;details:string;status:string;votes:number;email:string|null;templateId:string|null;templateName:string|null;createdAt:number};
export function IdeasPanel(){
 const {data,error,loading,refresh}=useAPI<{ideas:AdminIdea[]}>('admin/ideas');const templates=useAPI<{templates:AdminTemplateRow[]}>('admin/templates');
 async function update(id:string,change:Record<string,unknown>){try{await api('admin/ideas/'+id,'PATCH',change);toast.success('Idea updated');await refresh()}catch(e){toast.error((e as Error).message)}}
 return <><div className="admin-heading"><div><span className="eyebrow">CUSTOMERS ASK</span><h1>Template ideas</h1><p>What customers want next, with votes. Mark ideas as coming soon, link the template when it’s live, or decline them (declined ideas are hidden from customers).</p></div></div>
  {loading?<Loading/>:error||!data?<ErrorBox message={error} retry={refresh}/>:!data.ideas.length?<p className="panel-note">No ideas yet. Customers suggest them at /ideas.</p>:<div className="table-panel"><Table><TableHeader><TableRow><TableHead>Votes</TableHead><TableHead>Idea</TableHead><TableHead>Status</TableHead><TableHead>Template</TableHead></TableRow></TableHeader><TableBody>{data.ideas.map(i=><TableRow key={i.id}><TableCell><strong>{i.votes}</strong></TableCell><TableCell><strong>{i.title}</strong>{i.details&&<small className="block">{i.details}</small>}<small className="block">{i.email||'Deleted account'} · {date(i.createdAt)}</small></TableCell><TableCell><Pick label={'Status of '+i.title} value={i.status} onChange={v=>update(i.id,{status:v})} options={[{value:'open',label:'Open for votes'},{value:'planned',label:'Coming soon'},{value:'done',label:'Available'},{value:'declined',label:'Declined'}]}/></TableCell><TableCell><Pick label={'Template for '+i.title} value={i.templateId||''} onChange={v=>update(i.id,{status:'done',templateId:v})} options={(templates.data?.templates||[]).filter(t=>t.active).map(t=>({value:t.id,label:t.name}))}/></TableCell></TableRow>)}</TableBody></Table></div>}</>;
}
