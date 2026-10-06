'use client';
import {useEffect,useState,useCallback,useRef,type ReactNode} from 'react';
import {Loader2,AlertCircle,Film} from 'lucide-react';
import {toast} from 'sonner';
import {Skeleton} from '@/components/ui/skeleton';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
export async function api<T=unknown>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const res=await fetch('/api/'+path,{method,signal,headers:body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,credentials:'same-origin'});let d:unknown;try{d=await res.json()}catch{throw new Error('The studio could not be reached. Please try again.')}if(!res.ok)throw new Error((d as {error?:string}|null)?.error||'The request could not be completed.');return d as T;}
export function useAPI<T=unknown>(path:string|null){
 // The stored result remembers which path it belongs to, so a new path reads as loading without setting state in an effect.
 const [result,setResult]=useState<{path:string|null;data:T|null;error:string}>({path:null,data:null,error:''});
 const controller=useRef<AbortController|null>(null);
 // Resolves with the fresh value, or null when the request failed or was superseded.
 const refresh=useCallback(async():Promise<T|null>=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;
  if(!path)return null;
  try{const value=await api<T>(path,'GET',undefined,request.signal);if(!request.signal.aborted){setResult({path,data:value,error:''});return value}return null}
  catch(e){if(!request.signal.aborted)setResult(r=>({path,data:r.path===path?r.data:null,error:e instanceof Error?e.message:'Please try again.'}));return null}
 },[path]);
 useEffect(()=>{void refresh();return()=>controller.current?.abort()},[refresh]);
 const current=!!path&&result.path===path;
 return {data:current?result.data:null,error:current?result.error:'',loading:!!path&&!current,refresh};
}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><AlertCircle size={19}/><span>{message}</span>{retry&&<button onClick={retry}>Try again</button>}</div>}
export function Loading({rows=3}:{rows?:number}){return <div className="loading-stack" aria-label="Loading"><Skeleton className="h-8 w-52"/>{Array.from({length:rows},(_,i)=><Skeleton key={i} className="h-24 w-full rounded-xl"/>)}</div>}
export function Busy({children}:{children?:ReactNode}){return <><Loader2 className="spin" size={18}/>{children||'Please wait...'}</>}
export function Empty({title,description,children}:{title:string;description:string;children?:ReactNode}){return <div className="empty-state"><Film size={30}/><h3>{title}</h3><p>{description}</p>{children||<a href="/explore" className="button primary">Explore templates</a>}</div>}
export function Confirm({title,description,onConfirm,children}:{title:string;description:string;onConfirm:()=>void|Promise<void>;children:ReactNode}){return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={()=>{Promise.resolve(onConfirm()).catch(e=>toast.error(e.message))}}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
export function Pick({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:(string|{value:string;label:string})[];label:string}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o=>typeof o==='string'?<SelectItem value={o} key={o}>{o}</SelectItem>:<SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export const date=(n:number)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(n);
export function AccountNav({route}:{route:string}){return <nav className="account-nav">{[['/creations','My creations'],['/favorites','Favorites'],['/credits','Credits'],['/account','Account']].map(([url,name])=><a className={route===url?'active':''} key={url} href={url}>{name}</a>)}</nav>}
/** Warns about content refusals (C2): a count after the 1st and 2nd, a blocked message after the 3rd. */
export function ContentStrikeNotice({user}:{user:{contentStrikes:number;blocked:boolean}|null}){
 if(!user||(!user.blocked&&!user.contentStrikes))return null;
 return user.blocked
  ?<div className="error-box" role="alert"><AlertCircle size={19}/><span>Your account can no longer upload photos or create videos because content was refused 3 times. If you think this is a mistake, contact support. <a href="/terms#photos">Photo rules</a></span></div>
  :<div className="subtle-note readiness-warning" role="status"><strong>Content refused: {user.contentStrikes} of 3.</strong><p>The AI refused content in {user.contentStrikes===1?'one of your videos':'two of your videos'}. After 3 refusals your account can no longer create videos. Follow the <a href="/terms#photos">photo rules</a>.</p></div>;
}
export const safeNext=(value?:string)=>value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/creations';
