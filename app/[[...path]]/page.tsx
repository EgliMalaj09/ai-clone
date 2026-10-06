import Studio from '@/components/studio';
import {loadPage} from '@/lib/server/data';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata>{
 const {path=[]}=await params;
 if(path[0]==='template'){
   const {getPublicTemplate,config}=await import('@/lib/server/data');const t=await getPublicTemplate(path[1]);
   if(t){const image=new URL(t.thumbnail,config().origin).toString();return {title:`${t.name} AI Video Template | PROJECT STUDIO`,description:t.description,openGraph:{title:`${t.name} AI Video Template`,description:t.description,images:[image]},twitter:{card:'summary_large_image',title:t.name,description:t.description,images:[image]}};}
 }
 return {title:path.length?`${path[0].replace(/-/g,' ')} | PROJECT STUDIO`:'PROJECT STUDIO — Your next main character moment',robots:path[0]==='admin'||['creations','credits','account','favorites'].includes(path[0])?{index:false,follow:false}:undefined};
}
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {path=[]}=await params;const query=await searchParams;
 const single=['explore','creations','favorites','credits','account','login','register','forgot-password','reset-password','verify','privacy','terms'];
 const adminSections=['templates','media','generations','users','credit-packs','purchases','credits','providers','settings','operations','activity','connections'];
 const valid=!path.length||path.length===1&&single.includes(path[0])||path.length===2&&path[0]==='template'||path.length===3&&path[0]==='credits'&&path[1]==='checkout'||path[0]==='admin'&&(path.length===1||path.length===2&&adminSections.includes(path[1])||path.length===3&&path[1]==='templates');
 if(!valid)notFound();
 const data=await loadPage(path,await headers());
 if(path[0]==='template'&&!data.selectedTemplate)notFound();
 return <Studio route={'/'+path.join('/')} query={query} {...data}/>;
}
