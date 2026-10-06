'use client';
import {useEffect,useState,useCallback,useRef,type ReactNode} from 'react';
import {Loader2,AlertCircle,Film} from 'lucide-react';
import {toast} from 'sonner';
import {Skeleton} from '@/components/ui/skeleton';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
export async function api<T=any>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const res=await fetch('/api/'+path,{method,signal,headers:body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,credentials:'same-origin'});let d:any;try{d=await res.json()}catch{throw new Error('The studio could not be reached. Please try again.')}if(!res.ok)throw new Error(d.error||'The request could not be completed.');return d;}
export function useAPI<T=any>(path:string|null){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const controller=useRef<AbortController|null>(null);
 // Resolves with the fresh value, or null when the request failed or was superseded.
 const refresh=useCallback(async():Promise<T|null>=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;
  if(!path){setLoading(false);setData(null);return null;}
  try{const value=await api<T>(path,'GET',undefined,request.signal);if(!request.signal.aborted){setData(value);setError('');return value}return null}
  catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Please try again.');return null}
  finally{if(!request.signal.aborted)setLoading(false)}
 },[path]);
 useEffect(()=>{setLoading(true);void refresh();return()=>controller.current?.abort()},[refresh]);
 return {data,error,loading,refresh,setData};
}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><AlertCircle size={19}/><span>{message}</span>{retry&&<button onClick={retry}>Try again</button>}</div>}
export function Loading({rows=3}:{rows?:number}){return <div className="loading-stack" aria-label="Loading"><Skeleton className="h-8 w-52"/>{Array.from({length:rows},(_,i)=><Skeleton key={i} className="h-24 w-full rounded-xl"/>)}</div>}
export function Busy({children}:{children?:ReactNode}){return <><Loader2 className="spin" size={18}/>{children||'Please wait...'}</>}
export function Empty({title,description,children}:{title:string;description:string;children?:ReactNode}){return <div className="empty-state"><Film size={30}/><h3>{title}</h3><p>{description}</p>{children||<a href="/explore" className="button primary">Explore templates</a>}</div>}
export function Confirm({title,description,onConfirm,children}:{title:string;description:string;onConfirm:()=>void|Promise<void>;children:ReactNode}){return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={()=>{Promise.resolve(onConfirm()).catch(e=>toast.error(e.message))}}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
export function Pick({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:(string|{value:string;label:string})[];label:string}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o=>typeof o==='string'?<SelectItem value={o} key={o}>{o}</SelectItem>:<SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export const date=(n:number)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(n);
export function AccountNav({route}:{route:string}){return <nav className="account-nav">{[['/creations','My creations'],['/favorites','Favorites'],['/orders','Orders'],['/account','Account']].map(([url,name])=><a className={route===url?'active':''} key={url} href={url}>{name}</a>)}</nav>}
export const safeNext=(value?:string)=>value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/creations';
