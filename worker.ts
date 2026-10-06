import handler from 'vinext/server/fetch-handler';
import {tickQueue} from './lib/server/queue';
import {ensureSeed,one} from './lib/server/data';
import {recordDispatch} from './lib/server/dispatcher';

// Best-effort immediate delivery. Durable state remains in D1 if the Worker stops.
// The every-minute cron trigger (triggers.crons in vite.config.ts) is the production dispatcher.
async function drainWindow(){const deadline=Date.now()+22000;while(Date.now()<deadline){await tickQueue();const pending=await one("SELECT id FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL LIMIT 1");if(!pending)break;await new Promise(r=>setTimeout(r,1000));}}
const worker={
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
  const response=await handler.fetch(request,env,ctx);
  const path=new URL(request.url).pathname;
  if(request.method==='POST'&&response.status<400&&(path==='/api/generations'||/\/api\/admin\/generations\/[^/]+\/retry$/.test(path)))ctx.waitUntil(drainWindow().catch(e=>console.error('Background queue needs another dispatch',e instanceof Error?e.message:'unknown')));
  const out=new Response(response.body,response);out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Referrer-Policy','strict-origin-when-cross-origin');out.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');out.headers.set('Content-Security-Policy',"base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; form-action 'self'");if(new URL(request.url).protocol==='https:')out.headers.set('Strict-Transport-Security','max-age=31536000');return out;
 },
 // Awaited rather than passed to waitUntil, so a failure shows as an error in the Worker's cron event log.
 async scheduled(){try{await ensureSeed();await recordDispatch('cron');await drainWindow();}catch(e){console.error('Scheduled queue dispatch failed',e instanceof Error?e.message:'unknown');throw e;}}
};
export default worker;
