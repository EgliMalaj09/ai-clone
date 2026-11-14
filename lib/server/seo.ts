// robots.txt and sitemap.xml (X1.1). Public pages and every published template are listed;
// admin, account and API paths are kept out of search engines.
import {all,config,ensureSeed} from './data';
import {LANDING_PAGES,categorySlug} from '../landing-pages';

const PRIVATE_PATHS=['/admin','/account','/creations','/credits','/favorites','/api/','/v/'];
// Studio preview media (template thumbnails and preview videos from the Media library) is served under /api/media/med_…
// and is public, so Google Images and video search can fetch it. The longer Allow wins over "Disallow: /api/".
// Customer photos and videos share /api/media/ but need a signature or the owner's session, so they stay private.
const PUBLIC_API_PATHS=['/api/media/med_'];
// Public, indexable top-level pages (the storefront, pricing and the legal/help pages).
const PUBLIC_PATHS=['/','/explore','/pricing','/faq','/contact','/terms','/privacy','/feed'];

export function robotsTxt(){
 const origin=config().origin.replace(/\/$/,'');
 return ['User-agent: *',...PUBLIC_API_PATHS.map(p=>'Allow: '+p),...PRIVATE_PATHS.map(p=>'Disallow: '+p),'Allow: /','',`Sitemap: ${origin}/sitemap.xml`,''].join('\n');
}

const xmlEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));

type Entry={loc:string;lastmod?:string;priority:string;image?:string;video?:{thumbnail:string;title:string;description:string;content:string;duration:number}};
function urlXml(u:Entry){
 const parts=[`<loc>${xmlEscape(u.loc)}</loc>`];
 if(u.lastmod)parts.push(`<lastmod>${u.lastmod}</lastmod>`);
 parts.push('<changefreq>weekly</changefreq>',`<priority>${u.priority}</priority>`);
 if(u.image)parts.push(`<image:image><image:loc>${xmlEscape(u.image)}</image:loc></image:image>`);
 // Video sitemap (X1): Google finds videos for Video search and video rich results mainly through these entries.
 if(u.video){const v=u.video;parts.push(`<video:video><video:thumbnail_loc>${xmlEscape(v.thumbnail)}</video:thumbnail_loc><video:title>${xmlEscape(v.title.slice(0,100))}</video:title><video:description>${xmlEscape(v.description.slice(0,2048))}</video:description><video:content_loc>${xmlEscape(v.content)}</video:content_loc>${v.duration>0?`<video:duration>${Math.round(v.duration)}</video:duration>`:''}<video:family_friendly>yes</video:family_friendly></video:video>`);}
 return `  <url>${parts.join('')}</url>`;
}

export async function sitemapXml(){
 await ensureSeed().catch(()=>{});
 const origin=config().origin.replace(/\/$/,'');const abs=(p:string)=>new URL(p,origin+'/').toString();
 const templates=await all('SELECT slug,name,description,thumbnail,preview_video,duration,updated_at,created_at FROM templates WHERE active=1 ORDER BY featured DESC,created_at DESC').catch(()=>[]);
 const categories=await all('SELECT category,MAX(COALESCE(updated_at,created_at)) AS changed FROM templates WHERE active=1 GROUP BY category ORDER BY category').catch(()=>[]);
 const iso=(ms:unknown)=>new Date(Number(ms)||Date.now()).toISOString();
 // Static pages carry no lastmod: a date that changes on every request teaches Google to ignore lastmod for the whole site.
 // Collections (the storefront, landing and category pages) change when a template does.
 const newest=templates.reduce((m,t)=>Math.max(m,Number(t.updated_at||t.created_at)||0),0);
 const collection=newest?iso(newest):undefined;
 const urls:Entry[]=[
  ...PUBLIC_PATHS.map(p=>({loc:origin+p,lastmod:p==='/'||p==='/explore'?collection:undefined,priority:p==='/'?'1.0':p==='/explore'?'0.9':'0.5'})),
  // X1.7: landing pages for the main searches and one page per category.
  ...LANDING_PAGES.map(p=>({loc:`${origin}/${p.slug}`,lastmod:collection,priority:'0.8'})),
  ...categories.map(c=>({loc:`${origin}/category/${categorySlug(String(c.category))}`,lastmod:c.changed?iso(c.changed):undefined,priority:'0.7'})),
  ...templates.map(t=>({loc:`${origin}/template/${t.slug}`,lastmod:iso(t.updated_at||t.created_at),priority:'0.8',
   image:t.thumbnail?abs(String(t.thumbnail)):undefined,
   video:t.preview_video&&t.thumbnail?{thumbnail:abs(String(t.thumbnail)),title:String(t.name),description:String(t.description||t.name),content:abs(String(t.preview_video)),duration:Number(t.duration)||0}:undefined})),
 ];
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.map(urlXml).join('\n')}\n</urlset>\n`;
}
