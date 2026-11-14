import handler from 'vinext/server/fetch-handler';
import {tickQueue} from './lib/server/queue';
import {config,ensureSeed,one} from './lib/server/data';
import {recordDispatch} from './lib/server/dispatcher';
import {reportError} from './lib/server/errors';

// Best-effort immediate delivery. Durable state remains in D1 if the Worker stops.
// The every-minute cron trigger (triggers.crons in vite.config.ts) is the production dispatcher.
async function drainWindow(){const deadline=Date.now()+22000;while(Date.now()<deadline){await tickQueue();const pending=await one("SELECT id FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL LIMIT 1");if(!pending)break;await new Promise(r=>setTimeout(r,1000));}}
/** One address per page for Google (X1): once APP_ORIGIN is the real domain, pages opened on the *.workers.dev address or on
 * www. are sent there with a permanent redirect, so search engines never index two copies of the site. API calls (webhooks,
 * sign-in callbacks, the app itself) are never redirected, and nothing changes while APP_ORIGIN is still the workers.dev one. */
function canonicalRedirect(request:Request){
 if(request.method!=='GET'&&request.method!=='HEAD')return null;
 const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return null;
 let origin:URL;try{origin=new URL(config().origin)}catch{return null}
 if(origin.hostname.endsWith('.workers.dev')||url.hostname===origin.hostname)return null;
 if(!url.hostname.endsWith('.workers.dev')&&url.hostname!=='www.'+origin.hostname)return null;
 return Response.redirect(origin.origin+url.pathname+url.search,301);
}
const worker={
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
  const moved=canonicalRedirect(request);if(moved)return moved;
  if(request.method==='GET'){
   const p=new URL(request.url).pathname;
   if(p==='/robots.txt'||p==='/sitemap.xml'){
    const {robotsTxt,sitemapXml}=await import('./lib/server/seo');
    const [body,type]=p==='/robots.txt'?[robotsTxt(),'text/plain']:[await sitemapXml(),'application/xml'];
    return new Response(body,{headers:{'content-type':type+'; charset=utf-8','cache-control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});
   }
  }
  // V53: any visit checks that the background worker still runs (not on a local dev server, where cron never runs).
  const host=new URL(request.url).hostname;if(host!=='localhost'&&host!=='127.0.0.1')ctx.waitUntil(import('./lib/server/alerts').then(a=>a.checkDispatcher()).catch(()=>{}));
  const response=await handler.fetch(request,env,ctx);
  const path=new URL(request.url).pathname;
  if(request.method==='POST'&&response.status<400&&(path==='/api/generations'||path==='/api/generations/batch'||/\/api\/admin\/generations\/[^/]+\/retry$/.test(path)))ctx.waitUntil(drainWindow().catch(e=>reportError('queue','Background queue needs another dispatch',{error:e})));
  const out=new Response(response.body,response);out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Referrer-Policy','strict-origin-when-cross-origin');out.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');out.headers.set('Content-Security-Policy',"base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'");if(new URL(request.url).protocol==='https:')out.headers.set('Strict-Transport-Security','max-age=31536000');return out;
 },
 // Awaited rather than passed to waitUntil, so a failure shows as an error in the Worker's cron event log.
 async scheduled(){try{await ensureSeed();await recordDispatch('cron');await drainWindow();await (await import('./lib/server/alerts')).runAlertChecks().catch(e=>reportError('queue','Alert checks need another run',{error:e}));}catch(e){await reportError('queue','Scheduled queue dispatch failed',{error:e});throw e;}}
};
export default worker;
