import Studio from '@/components/studio';
import {loadPage,config} from '@/lib/server/data';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {langFromCookie,translate,type Lang} from '@/lib/i18n';
import {categorySlug,landingPage} from '@/lib/landing-pages';
import {BRAND} from '@/lib/brand';
export const dynamic='force-dynamic';
const titles:Record<string,string>={explore:'AI video templates',creations:'My creations',favorites:'Favorites',credits:'Credits',pricing:'Pricing',account:'Your account',login:'Sign in',register:'Create an account','forgot-password':'Forgot password','reset-password':'Choose a new password',verify:'Verify your email','confirm-email':'Confirm your new email',privacy:'Privacy Policy',terms:'Terms of Service',faq:'Help & FAQ',contact:'Contact us','removal-request':'Report a video',unsubscribe:'Unsubscribe',ideas:'Template ideas',feed:'Community'};
// X1: every public page has its own description (a shared one makes Google rewrite or ignore it).
const descriptions:Record<string,string>={
 '':'Make an AI video from one photo: pick a wedding, birthday, sport or anime template, upload your photo and get your video in minutes. Pay only for delivered videos.',
 explore:'Browse every AI video template: cinematic, action, couples, anime, sports, travel and more. Pick one, upload a photo and make your own short video.',
 pricing:'Credit packs for AI videos, with no subscription. Buy once and use the credits on any template; you pay only for videos that are delivered.',
 faq:'Answers about making AI videos from a photo: how it works, which photos work best, credits and payment, privacy, and what happens when a video fails.',
 contact:'Contact the {brand} team about a video, your credits or your account. Write to us and we reply quickly.',
 feed:'AI videos made from one photo by the {brand} community. Get inspired, then pick the same template and make your own.',
 terms:'The terms for making AI videos with {brand}: your account, credits, which photos you may upload, and your rights.',
 privacy:'How {brand} handles your photos, videos and personal data, how long they are kept and how you can delete them.',
 ideas:'Suggest a new AI video template and vote for the ideas you want to see next on {brand}.',
};
// Private pages stay out of search entirely; sign-in and other one-off pages are not indexed but their links are followed.
const PRIVATE=['creations','credits','account','favorites'];
const UTILITY=['login','register','forgot-password','reset-password','verify','confirm-email','unsubscribe','removal-request'];
type Social={title:string;description:string;url:string;lang:string;image?:string;video?:string};
/** Open Graph + Twitter tags, so a shared link shows a title, text and picture (WhatsApp, Facebook, Instagram, X). */
function social(o:Social):Pick<Metadata,'openGraph'|'twitter'>{
 return {openGraph:{title:o.title,description:o.description,url:o.url,siteName:BRAND,locale:o.lang==='en'?'en_US':'sq_AL',type:o.video?'video.other':'website',...(o.image?{images:[o.image]}:{}),...(o.video?{videos:[{url:o.video}]}:{})},
  twitter:{card:o.image?'summary_large_image':'summary',title:o.title,description:o.description,...(o.image?{images:[o.image]}:{})}};
}
/** The picture for pages without their own: the poster of the first featured template. */
async function defaultImage(){
 const {one}=await import('@/lib/server/data');
 const r=await one("SELECT thumbnail FROM templates WHERE active=1 AND thumbnail IS NOT NULL AND thumbnail!='' ORDER BY featured DESC,sort_order,created_at DESC LIMIT 1").catch(()=>null);
 return r?.thumbnail?new URL(String(r.thumbnail),config().origin).toString():undefined;
}
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata>{
 const {path=[]}=await params;const lang=langFromCookie((await headers()).get('cookie'));const tr=(s:string,vars?:Record<string,string|number>)=>path[0]==='admin'?s:translate(lang,s,vars);
 const origin=config().origin.replace(/\/$/,'');const abs=(p:string)=>new URL(p,origin+'/').toString();
 if(path[0]==='v'&&path[1]){const {sharedVideo}=await import('@/lib/server/share');const s=await sharedVideo(path[1]);if(s){const title=`${s.templateName} — ${tr('made with')} ${BRAND}`;return {title,description:tr('Watch this AI video and make your own from one photo.'),robots:{index:false,follow:false},openGraph:{title,description:tr('Watch this AI video and make your own from one photo.'),type:'video.other',images:[abs(s.thumbnail)],videos:[{url:abs(s.video),type:s.mime}]},twitter:{card:'summary_large_image',title,images:[abs(s.thumbnail)]}};}}
 if(path[0]==='template'){
   const {getPublicTemplate}=await import('@/lib/server/data');const t=await getPublicTemplate(path[1]);
   if(t){const url=origin+'/template/'+t.slug,title=`${t.name} — ${tr('AI video from one photo')}`;
    // A short description is completed with what the page offers, so the search snippet says what you get.
    const description=t.description.length<110?`${t.description} ${tr('Upload one photo and get your own AI video in minutes.')}`.trim():t.description;
    return {title:`${title} | ${BRAND}`,description,alternates:{canonical:url},...social({title,description,url,lang,image:abs(t.thumbnail),video:t.previewVideo?abs(t.previewVideo):undefined})};}
 }
 // X1.7: landing pages for the main searches and the category pages.
 if(path[0]==='category'&&path[1]||path.length===1&&landingPage(path[0])){
   const {landingTemplates,ensureSeed}=await import('@/lib/server/data');await ensureSeed().catch(()=>{});const d=await landingTemplates(path,null);const l=d?.landing;
   if(l){const vars={category:l.category?tr(l.category):''};const title=translate(lang,l.title,vars);const url=origin+'/'+path.join('/');
    // A category page names its own templates, so every category has a different description.
    const names=d.templates.slice(0,3).map(t=>t.name).join(', ');
    const description=l.kind==='category'&&names?tr('AI video templates for {category} ({names}): upload one photo and make your own short video in minutes.',{...vars,names}):translate(lang,l.description,vars);
    const image=d.templates[0]?abs(d.templates[0].thumbnail):undefined;
    return {title:`${title} | ${BRAND}`,description,alternates:{canonical:url},...social({title,description,url,lang,image})};}
 }
 const key=path[0]||'';
 const title=path[0]==='admin'?'Studio admin':path[0]==='credits'&&path[1]==='checkout'?'Test checkout':titles[key];
 const isPrivate=path[0]==='admin'||PRIVATE.includes(key),isUtility=UTILITY.includes(key);
 const url=origin+(path.length?'/'+path.join('/'):'/');
 const fullTitle=title?`${tr(title)} | ${BRAND}`:path.length?`${tr('Page not found')} | ${BRAND}`:`${tr('Make an AI video from one photo')} | ${BRAND}`;
 const description=tr(descriptions[key]||descriptions[''],{brand:BRAND});
 if(isPrivate)return {title:fullTitle,description,robots:{index:false,follow:false}};
 const page={title:fullTitle,description,alternates:{canonical:url},...social({title:fullTitle,description,url,lang,image:await defaultImage()})};
 return isUtility?{...page,robots:{index:false,follow:true}}:page;
}
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {path=[]}=await params;const query=await searchParams;
 const single=['explore','creations','favorites','credits','pricing','account','login','register','forgot-password','reset-password','verify','confirm-email','privacy','terms','faq','contact','removal-request','unsubscribe','ideas','feed'];
 const adminSections=['templates','media','generations','users','credit-packs','purchases','reports','announcements','ideas','promos','ai-costs','credits','providers','settings','operations','activity','connections'];
 const valid=!path.length||path.length===1&&(single.includes(path[0])||!!landingPage(path[0]))||path.length===2&&path[0]==='category'||path.length===2&&(path[0]==='template'||path[0]==='v')||path.length===3&&path[0]==='credits'&&path[1]==='checkout'||path[0]==='admin'&&(path.length===1||path.length===2&&adminSections.includes(path[1])||path.length===3&&['templates','users'].includes(path[1]));
 if(!valid)notFound();
 const data=await loadPage(path,await headers(),query);
 if(path[0]==='template'&&!data.selectedTemplate)notFound();
 if(path[0]==='v'&&!data.shared)notFound();
 if(path[0]==='category'&&!data.landing)notFound();
 const ld=await structuredData(path,data,langFromCookie((await headers()).get('cookie')));
 // Escape `<` (and the U+2028/U+2029 line separators) so a value in the structured data can never break out of the script tag.
 const ldJson=ld&&JSON.stringify(ld).replace(new RegExp('[<\\u2028\\u2029]','g'),c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 return <>{ldJson&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:ldJson}}/>}<Studio route={'/'+path.join('/')} query={query} {...data}/></>;
}
// Structured data (JSON-LD) for search engines (X1.4): Organization + WebSite on the homepage, VideoObject + breadcrumbs on a
// template page, a collection on landing and category pages, and Product/Offer for the credit packs on pricing. Text is in
// the language the page shows: Google ignores structured data that does not match the visible page.
async function structuredData(path:string[],data:Awaited<ReturnType<typeof loadPage>>,lang:Lang){
 const origin=config().origin.replace(/\/$/,'');const abs=(p:string)=>new URL(p,origin+'/').toString();const tr=(s:string,vars?:Record<string,string|number>)=>translate(lang,s,vars);
 const ctx='https://schema.org';
 const crumbs=(items:[string,string][])=>({'@context':ctx,'@type':'BreadcrumbList',itemListElement:items.map(([name,url],i)=>({'@type':'ListItem',position:i+1,name,item:url}))});
 if(!path.length||path[0]==='explore'){
  const support=data.support;const sameAs=support?[support.instagram,support.tiktok,support.facebook].filter(Boolean):[];
  return [{'@context':ctx,'@type':'Organization',name:BRAND,url:origin,logo:origin+'/icons/icon-512.png',...(sameAs.length?{sameAs}:{}),...(support?.email?{contactPoint:{'@type':'ContactPoint',contactType:'customer support',email:support.email,availableLanguage:['sq','en']}}:{})},
   {'@context':ctx,'@type':'WebSite',name:BRAND,url:origin,inLanguage:lang}];
 }
 if(path[0]==='template'&&data.selectedTemplate){const t=data.selectedTemplate;const url=origin+'/template/'+t.slug;
  return [{'@context':ctx,'@type':'VideoObject',name:t.name,description:t.description||t.name,thumbnailUrl:abs(t.thumbnail),uploadDate:new Date(t.createdAt).toISOString(),...(t.previewVideo?{contentUrl:abs(t.previewVideo)}:{}),...(t.duration>0?{duration:`PT${Math.round(t.duration)}S`}:{}),inLanguage:lang},
   crumbs([[BRAND,origin+'/'],[tr(t.category),origin+'/category/'+categorySlug(t.category)],[t.name,url]])];}
 // X1.7: a landing or category page is a collection of templates.
 if(data.landing){const l=data.landing;const url=origin+'/'+path.join('/');const vars={category:l.category?tr(l.category):''};
  const page={'@context':ctx,'@type':'CollectionPage',name:tr(l.title,vars),url,inLanguage:lang,mainEntity:{'@type':'ItemList',itemListElement:data.templates.slice(0,30).map((t,i)=>({'@type':'ListItem',position:i+1,url:origin+'/template/'+t.slug,name:t.name}))}};
  return l.kind==='category'?[page,crumbs([[BRAND,origin+'/'],[tr(l.category||''),url]])]:page;}
 if(path[0]==='faq'){const {FAQ}=await import('@/lib/faq');return {'@context':ctx,'@type':'FAQPage',inLanguage:lang,mainEntity:FAQ.flatMap(g=>g.items).map(([q,a])=>({'@type':'Question',name:tr(q),acceptedAnswer:{'@type':'Answer',text:tr(a).replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g,'$1')}}))};}
 if(path[0]==='pricing'){const {listPackages}=await import('@/lib/server/credit-purchases');const packs=await listPackages().catch(()=>[]);const items=packs.filter(p=>p.prices.EUR).map((p,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'Product',name:tr('{name} credit pack',{name:p.name}),description:tr('{n} credits for AI videos',{n:p.totalCredits}),brand:{'@type':'Brand',name:BRAND},offers:{'@type':'Offer',price:(p.prices.EUR/100).toFixed(2),priceCurrency:'EUR',availability:'https://schema.org/InStock',url:origin+'/pricing'}}}));return items.length?{'@context':ctx,'@type':'ItemList',itemListElement:items}:null;}
 return null;
}
