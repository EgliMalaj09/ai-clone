import {useState} from 'react';
import {ArrowLeft,CheckCircle2,ShieldAlert} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {api,Busy,ErrorBox,Field} from './shared';
import {useI18n} from './i18n';

// Public removal request form (V30): for someone shown in a video without their agreement.
export function RemovalRequestPage({query}:{query:Record<string,string|undefined>}){
 const {t}=useI18n();
 const [video,setVideo]=useState(query.video?'/v/'+query.video.replace(/[^A-Za-z0-9]/g,'').slice(0,12):''),[name,setName]=useState(''),[email,setEmail]=useState(''),[relation,setRelation]=useState('self'),[details,setDetails]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<null|{hidden:boolean}>(null);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{setDone(await api<{hidden:boolean}>('removal-requests','POST',{video,name,email,relation,details,confirm}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <article className="legal-page help-page removal-page"><a className="back-link" href="/"><ArrowLeft size={16}/>{t('Back to studio')}</a><span className="eyebrow">{t('REPORT A VIDEO')}</span><h1>{t('Are you in a video you didn’t agree to?')}</h1>
  {done?<div className="removal-done" role="status"><CheckCircle2 size={30}/><h2>{t('We received your request.')}</h2><p>{t(done.hidden?'The video is already hidden while we review it. We’ll email you with the result, usually within one business day.':'We’ll find the video and email you with the result, usually within one business day.')}</p></div>:<>
  <p>{t('Tell us which video it is. If you send the link to a shared video, we hide it right away while we review your request. Your details are only used to handle this request.')}</p>
  <form onSubmit={submit} className="removal-form">
   <Field label={t('Link to the video')} hint={t('Copy the link of the page where you saw it. If you don’t have a link, describe the video.')}><input required maxLength={500} value={video} onChange={e=>setVideo(e.target.value)} placeholder="https://…/v/…"/></Field>
   <div className="form-grid"><Field label={t('Your name')}><input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></Field><Field label={t('Your email')}><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field></div>
   <Field label={t('Who is in the video?')}><select value={relation} onChange={e=>setRelation(e.target.value)}><option value="self">{t('Me')}</option><option value="representative">{t('Someone I represent (for example my child)')}</option><option value="other">{t('Someone else')}</option></select></Field>
   <Field label={t('Why should it be removed?')}><textarea required minLength={10} maxLength={2000} rows={4} value={details} onChange={e=>setDetails(e.target.value)}/></Field>
   <label className="consent"><Checkbox checked={confirm} onCheckedChange={v=>setConfirm(v===true)}/><span>{t('I confirm that this information is true and that I am the person in the video or allowed to act for them.')}</span></label>
   {error&&<ErrorBox message={error}/>}<button className="button primary" disabled={busy||!confirm}>{busy?<Busy/>:<><ShieldAlert size={17}/>{t('Send removal request')}</>}</button>
  </form></>}
 </article>;
}

/** One-click unsubscribe from news emails (V36): the signed link in each email lands here. */
export function UnsubscribePage({query}:{query:Record<string,string|undefined>}){
 const {t}=useI18n();const [state,setState]=useState<'idle'|'busy'|'done'>('idle'),[error,setError]=useState('');
 async function go(){setState('busy');setError('');try{await api('unsubscribe','POST',{u:query.u||'',s:query.s||''});setState('done')}catch(e){setError((e as Error).message);setState('idle')}}
 return <article className="legal-page help-page"><span className="eyebrow">{t('EMAILS')}</span><h1>{t(state==='done'?'You’re unsubscribed.':'Stop news emails?')}</h1>
  <p>{t(state==='done'?'You won’t get news and offers from us any more. Emails about your account and your videos still arrive.':'You’ll stop getting news, offers and new-template emails. Emails about your account and your videos still arrive.')}</p>
  {error&&<ErrorBox message={error}/>}{state!=='done'&&<button className="button primary" disabled={state==='busy'} onClick={go}>{state==='busy'?<Busy/>:t('Unsubscribe')}</button>}{state==='done'&&<a className="button secondary" href="/">{t('Back to studio')}</a>}
 </article>;
}
