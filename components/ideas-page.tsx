import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronUp,Lightbulb} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,Busy,ErrorBox,Field,Loading} from './shared';
import {useI18n} from './i18n';
import type {StudioUser} from '@/lib/contracts';

// Template ideas (V43): suggest a template and vote for the ones you want most.
type Idea={id:string;title:string;details:string;status:string;votes:number;voted:boolean;templateSlug:string|null;createdAt:number};
export function IdeasPage({user}:{user:StudioUser|null}){
 const {t}=useI18n();const {data,error,loading,refresh}=useAPI<{ideas:Idea[]}>('ideas');const [title,setTitle]=useState(''),[details,setDetails]=useState(''),[busy,setBusy]=useState(false);
 async function vote(id:string){if(!user){window.location.assign('/login?next=/ideas');return}try{await api('ideas/'+id+'/vote','POST',{});await refresh()}catch(e){toast.error(t((e as Error).message))}}
 async function suggest(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('ideas','POST',{title,details});setTitle('');setDetails('');toast.success(t('Thanks! Your idea is on the list.'));await refresh()}catch(e){toast.error(t((e as Error).message))}finally{setBusy(false)}}
 const label=(s:string)=>t(s==='planned'?'Coming soon':s==='done'?'Available now':'Open for votes');
 return <article className="legal-page help-page ideas-page"><a className="back-link" href="/explore"><ArrowLeft size={16}/>{t('All templates')}</a><span className="eyebrow">{t('TEMPLATE IDEAS')}</span><h1>{t('What should we make next?')}</h1><p>{t('Suggest a look you’d love to step into, or vote for other ideas. The most wanted ones are made first.')}</p>
  {user?<form className="idea-form" onSubmit={suggest}><Field label={t('Your idea')}><input required minLength={3} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder={t('e.g. Bollywood dance scene')}/></Field><Field label={t('Details (optional)')}><textarea rows={2} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></Field><button className="button primary small" disabled={busy}>{busy?<Busy/>:<><Lightbulb size={15}/>{t('Suggest it')}</>}</button></form>:<p><a className="text-link" href="/login?next=/ideas">{t('Sign in to suggest an idea or vote.')}</a></p>}
  {loading?<Loading rows={2}/>:error||!data?<ErrorBox message={error} retry={refresh}/>:!data.ideas.length?<p className="panel-note">{t('No ideas yet. Be the first!')}</p>:<ul className="idea-list">{data.ideas.map(i=><li key={i.id}><button className={'vote-button'+(i.voted?' voted':'')} disabled={i.status==='done'} aria-pressed={i.voted} aria-label={t(i.voted?'Remove your vote for {name}':'Vote for {name}',{name:i.title})} onClick={()=>vote(i.id)}><ChevronUp size={16}/><strong>{i.votes}</strong></button><div><strong>{i.title}</strong>{i.details&&<p>{i.details}</p>}<span className={'status '+(i.status==='done'?'completed':i.status==='planned'?'queued':'pending')}>{label(i.status)}</span>{i.templateSlug&&<a className="text-link" href={'/template/'+i.templateSlug}> {t('Try it')} <ArrowUpRight size={13}/></a>}</div></li>)}</ul>}
 </article>;
}
