// robots.txt and sitemap.xml (X1.1). Public pages and every published template are listed;
// admin, account and API paths are kept out of search engines.
import {all,config,ensureSeed} from './data';

const PRIVATE_PATHS=['/admin','/account','/creations','/credits','/favorites','/api/','/v/'];
// Public, indexable top-level pages (the storefront, pricing and the legal/help pages).
const PUBLIC_PATHS=['/','/explore','/pricing','/faq','/contact','/terms','/privacy','/feed'];

export function robotsTxt(){
 const origin=config().origin.replace(/\/$/,'');
 return ['User-agent: *',...PRIVATE_PATHS.map(p=>'Disallow: '+p),'Allow: /','',`Sitemap: ${origin}/sitemap.xml`,''].join('\n');
}

const xmlEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));

export async function sitemapXml(){
 await ensureSeed().catch(()=>{});
 const origin=config().origin.replace(/\/$/,'');
 const templates=await all('SELECT slug,updated_at,created_at FROM templates WHERE active=1 ORDER BY featured DESC,created_at DESC').catch(()=>[]);
 const iso=(ms:unknown)=>new Date(Number(ms)||Date.now()).toISOString();
 const urls=[
  ...PUBLIC_PATHS.map(p=>({loc:origin+p,lastmod:new Date().toISOString(),priority:p==='/'?'1.0':'0.7'})),
  ...templates.map(t=>({loc:`${origin}/template/${t.slug}`,lastmod:iso(t.updated_at||t.created_at),priority:'0.8'})),
 ];
 const body=urls.map(u=>`  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
