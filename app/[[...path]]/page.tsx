import Studio from '@/components/studio';
import {loadPage,config} from '@/lib/server/data';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {langFromCookie,translate} from '@/lib/i18n';
export const dynamic='force-dynamic';
const titles:Record<string,string>={explore:'Explore templates',creations:'My creations',favorites:'Favorites',credits:'Credits',pricing:'Pricing',account:'Your account',login:'Sign in',register:'Create an account','forgot-password':'Forgot password','reset-password':'Choose a new password',verify:'Verify your email','confirm-email':'Confirm your new email',privacy:'Privacy Policy',terms:'Terms of Service',faq:'Help & FAQ',contact:'Contact us','removal-request':'Report a video',unsubscribe:'Unsubscribe',ideas:'Template ideas',feed:'Community'};
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata>{
 const {path=[]}=await params;const lang=langFromCookie((await headers()).get('cookie'));const tr=(s:string)=>path[0]==='admin'?s:translate(lang,s);
 if(path[0]==='v'&&path[1]){const {sharedVideo}=await import('@/lib/server/share');const {config}=await import('@/lib/server/data');const s=await sharedVideo(path[1]);if(s){const origin=config().origin;const title=`${s.templateName} — ${tr('made with')} PROJECT STUDIO`;return {title,description:tr('Watch this AI video and make your own from one photo.'),robots:{index:false,follow:false},openGraph:{title,description:tr('Watch this AI video and make your own from one photo.'),type:'video.other',images:[new URL(s.thumbnail,origin).toString()],videos:[{url:new URL(s.video,origin).toString(),type:s.mime}]},twitter:{card:'summary_large_image',title,images:[new URL(s.thumbnail,origin).toString()]}};}}
 if(path[0]==='template'){
   const {getPublicTemplate,config}=await import('@/lib/server/data');const t=await getPublicTemplate(path[1]);
   if(t){const image=new URL(t.thumbnail,config().origin).toString();return {title:`${t.name} ${tr('AI Video Template')} | PROJECT STUDIO`,description:t.description,alternates:{canonical:config().origin.replace(/\/$/,'')+'/template/'+t.slug},openGraph:{title:`${t.name} ${tr('AI Video Template')}`,description:t.description,images:[image]},twitter:{card:'summary_large_image',title:t.name,description:t.description,images:[image]}};}
 }
 const title=path[0]==='admin'?'Studio admin':path[0]==='credits'&&path[1]==='checkout'?'Test checkout':titles[path[0]||''];
 const noindex=path[0]==='admin'||['creations','credits','account','favorites'].includes(path[0]);
 const canonical=config().origin.replace(/\/$/,'')+(path.length?'/'+path.join('/'):'/');
 return {title:title?`${tr(title)} | PROJECT STUDIO`:path.length?`${tr('Page not found')} | PROJECT STUDIO`:`PROJECT STUDIO — ${tr('Your next main character moment')}`,description:tr('Choose a look. Upload a photo. Make your own AI video with credits, and pay only for videos that are delivered.'),robots:noindex?{index:false,follow:false}:undefined,alternates:noindex?undefined:{canonical}};
}
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {path=[]}=await params;const query=await searchParams;
 const single=['explore','creations','favorites','credits','pricing','account','login','register','forgot-password','reset-password','verify','confirm-email','privacy','terms','faq','contact','removal-request','unsubscribe','ideas','feed'];
 const adminSections=['templates','media','generations','users','credit-packs','purchases','reports','announcements','ideas','promos','ai-costs','credits','providers','settings','operations','activity','connections'];
 const valid=!path.length||path.length===1&&single.includes(path[0])||path.length===2&&(path[0]==='template'||path[0]==='v')||path.length===3&&path[0]==='credits'&&path[1]==='checkout'||path[0]==='admin'&&(path.length===1||path.length===2&&adminSections.includes(path[1])||path.length===3&&['templates','users'].includes(path[1]));
 if(!valid)notFound();
 const data=await loadPage(path,await headers(),query);
 if(path[0]==='template'&&!data.selectedTemplate)notFound();
 if(path[0]==='v'&&!data.shared)notFound();
 const ld=await structuredData(path,data);
 return <>{ld&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(ld)}}/>}<Studio route={'/'+path.join('/')} query={query} {...data}/></>;
}
// Structured data (JSON-LD) for search engines (X1.4): Organization + WebSite on the homepage,
// VideoObject on a template page, and Product/Offer for the credit packs on pricing.
async function structuredData(path:string[],data:Awaited<ReturnType<typeof loadPage>>){
 const origin=config().origin.replace(/\/$/,'');const BRAND='PROJECT STUDIO';
 if(!path.length||path[0]==='explore')return [{'@context':'https://schema.org','@type':'Organization',name:BRAND,url:origin,logo:origin+'/favicon.svg'},{'@context':'https://schema.org','@type':'WebSite',name:BRAND,url:origin}];
 if(path[0]==='template'&&data.selectedTemplate){const t=data.selectedTemplate;return {'@context':'https://schema.org','@type':'VideoObject',name:t.name,description:t.description,thumbnailUrl:new URL(t.thumbnail,origin).toString(),uploadDate:new Date(t.createdAt).toISOString(),...(t.previewVideo?{contentUrl:new URL(t.previewVideo,origin).toString()}:{})};}
 if(path[0]==='pricing'){const {listPackages}=await import('@/lib/server/credit-purchases');const packs=await listPackages().catch(()=>[]);const items=packs.filter(p=>p.prices.EUR).map((p,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'Product',name:`${p.name} credit pack`,description:`${p.totalCredits} credits`,offers:{'@type':'Offer',price:(p.prices.EUR/100).toFixed(2),priceCurrency:'EUR',availability:'https://schema.org/InStock',url:origin+'/pricing'}}}));return items.length?{'@context':'https://schema.org','@type':'ItemList',itemListElement:items}:null;}
 return null;
}
