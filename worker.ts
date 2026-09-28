import handler from 'vinext/server/fetch-handler';
import {tickQueue} from './lib/server/queue';
import {ensureSeed,one,now,run} from './lib/server/data';

// Best-effort immediate delivery. Durable state remains in D1 if the Worker stops.
// A scheduled queue dispatcher is required for reliable long-running production work.
async function drainWindow(){const deadline=Date.now()+22000;while(Date.now()<deadline){await tickQueue();const pending=await one("SELECT id FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL LIMIT 1");if(!pending)break;await new Promise(r=>setTimeout(r,1000));}}
export default {
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
  const response=await handler.fetch(request,env,ctx);
  const path=new URL(request.url).pathname;
  if(request.method==='POST'&&response.status<400&&(/\/api\/orders\/[^/]+\/(pay|verify)$/.test(path)||path==='/api/webhooks/stripe'||/\/api\/admin\/generations\/[^/]+\/retry$/.test(path)))ctx.waitUntil(drainWindow().catch(e=>console.error('Background queue needs another dispatch',e instanceof Error?e.message:'unknown')));
  const out=new Response(response.body,response);out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Referrer-Policy','strict-origin-when-cross-origin');out.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');out.headers.set('Content-Security-Policy',"base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; form-action 'self' https://checkout.stripe.com");if(new URL(request.url).protocol==='https:')out.headers.set('Strict-Transport-Security','max-age=31536000');return out;
 },
 async scheduled(_event:ScheduledController,_env:Cloudflare.Env,ctx:ExecutionContext){ctx.waitUntil((async()=>{await ensureSeed();await run("INSERT INTO app_settings (key,value) VALUES ('queue_dispatch_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(now()));await drainWindow()})());}
};
