'use client';
import {useState} from 'react';
import {Film,RefreshCw,Search,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Progress} from '@/components/ui/progress';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {api,useAPI,Confirm,ErrorBox,Loading,Pick,date} from './shared';

type Media={id:string;url:string;mime:string;size:number;name:string;createdAt:number;uploadedBy:string|null;usedBy:{id:string;name:string}[];creations:number;removableAt:number|null};
type Library={media:Media[];usage:{bytes:number;count:number;maxBytes:number;maxFiles:number}};
const size=(bytes:number)=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GB':(bytes/1024**2).toFixed(1)+' MB';

export function MediaLibrary(){
 const {data,error,loading,refresh}=useAPI<Library>('admin/media');const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const list=(data?.media||[]).filter(m=>m.name.toLowerCase().includes(search.toLowerCase())&&(filter==='all'||filter==='used'&&!m.removableAt||filter==='unused'&&!!m.removableAt));
 const usage=data?.usage;
 return <><div className="admin-heading"><div><span className="eyebrow">STUDIO PREVIEWS</span><h1>Media library</h1><p>Thumbnails, preview videos and example images used by your templates. Files no template or creation uses are removed automatically 24 hours after upload.</p></div><button className="button secondary small" onClick={()=>refresh()}><RefreshCw size={16}/>Refresh</button></div>
 {usage&&<section className="panel"><strong>{size(usage.bytes)} of {size(usage.maxBytes)} · {usage.count} of {usage.maxFiles} files</strong><Progress className="mt-3" value={Math.min(100,Math.max(usage.bytes/usage.maxBytes,usage.count/usage.maxFiles)*100)} aria-label="Media library usage"/></section>}
 <div className="admin-toolbar"><label className="search-field"><Search size={17}/><input placeholder="Search files..." aria-label="Search media" value={search} onChange={e=>setSearch(e.target.value)}/></label><Pick label="Filter media" value={filter} onChange={setFilter} options={[{value:'all',label:'All files'},{value:'used',label:'In use'},{value:'unused',label:'Unused'}]}/></div>
 {loading?<Loading/>:error?<ErrorBox message={error} retry={refresh}/>:<div className="table-panel"><Table><TableHeader><TableRow><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Used by</TableHead><TableHead>Uploaded</TableHead><TableHead/></TableRow></TableHeader><TableBody>{list.map(m=><TableRow key={m.id}>
  <TableCell><a className="table-template" href={m.url} target="_blank" rel="noreferrer">{m.mime.startsWith('video/')?<video src={m.url} muted preload="metadata" aria-label={m.name}/>:<img src={m.url} alt=""/>}<div><strong>{m.name}</strong><small>{m.mime.startsWith('video/')?<><Film size={12} className="inline"/> Video</>:'Image'}</small></div></a></TableCell>
  <TableCell>{size(m.size)}</TableCell>
  <TableCell>{m.usedBy.map(t=><a key={t.id} className="text-link block" href={'/admin/templates/'+t.id}>{t.name}</a>)}{m.creations>0&&<small className="block">Poster for {m.creations} creation{m.creations===1?'':'s'}</small>}{m.removableAt&&<span className="status pending">Unused · removed after {date(m.removableAt)}</span>}</TableCell>
  <TableCell>{date(m.createdAt)}{m.uploadedBy&&<small className="block">{m.uploadedBy}</small>}</TableCell>
  <TableCell>{m.removableAt&&<Confirm title={'Delete '+m.name+'?'} description="The file will be permanently removed from storage." onConfirm={async()=>{await api('admin/media/'+m.id,'DELETE');await refresh();toast.success('File deleted')}}><button className="icon-button danger" aria-label={'Delete '+m.name}><Trash2 size={16}/></button></Confirm>}</TableCell>
 </TableRow>)}</TableBody></Table>{!list.length&&<div className="small-empty"><p>{data?.media.length?'No matching files.':'No uploaded preview media yet. Upload previews from a template.'}</p></div>}</div>}</>;
}
