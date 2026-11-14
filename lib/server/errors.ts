import {all,config,now,run,uid} from './data';
import {serviceConfig} from './connections';

// Error tracking (C7): every server error and provider/webhook failure is logged, kept for 30 days in error_events
// (Admin → Operations), and forwarded to Sentry when a DSN is configured. Reporting never throws.

export type ErrorSource='api'|'page'|'generation'|'provider'|'payment'|'webhook'|'email'|'credits'|'queue'|'storage'|'auth';
type Context=Record<string,string|number|boolean|null|undefined>;

const errorText=(e:unknown)=>e instanceof Error?e.message:typeof e==='string'?e:e===undefined?'':'unknown';

/** Parses a Sentry DSN (https://<key>@<host>/<project>) into its envelope endpoint and key. */
export function sentryTarget(dsn:string){
 const m=dsn.trim().match(/^https:\/\/([0-9a-f]{16,64})@([\w.-]+(?::\d+)?)\/(\d+)$/i);
 return m?{key:m[1],url:`https://${m[2]}/api/${m[3]}/envelope/`}:null;
}

async function toSentry(dsn:string,source:ErrorSource,level:string,message:string,detail:string,context:Context){
 const target=sentryTarget(dsn);if(!target)return;
 const eventId=crypto.randomUUID().replace(/-/g,'');
 const event={event_id:eventId,timestamp:now()/1000,platform:'javascript',level,logger:source,server_name:'worker',environment:config().demo?'development':'production',
  message:{formatted:message},exception:detail?{values:[{type:source,value:detail.slice(0,2000)}]}:undefined,tags:{source},extra:context};
 const body=[JSON.stringify({event_id:eventId,sent_at:new Date().toISOString()}),JSON.stringify({type:'event'}),JSON.stringify(event)].join('\n');
 const r=await fetch(target.url,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope','X-Sentry-Auth':`Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=studio-worker/1.0`},body,signal:AbortSignal.timeout(5000),redirect:'manual'});
 if(!r.ok)console.error('Sentry did not accept the error report',r.status);
}

/** Records a failure with its IDs (generation, purchase…) so it can be found from the admin and the tracker. */
export async function reportError(source:ErrorSource,message:string,{error,context={},level='error'}:{error?:unknown;context?:Context;level?:'error'|'warning'}={}){
 const detail=errorText(error).slice(0,2000);
 const clean=Object.fromEntries(Object.entries(context).filter(([,v])=>v!==undefined));
 console.error(`[${source}] ${message}`,JSON.stringify(clean),detail);
 try{await run('INSERT INTO error_events (id,source,level,message,detail,context,created_at) VALUES (?,?,?,?,?,?,?)',uid('err_'),source,level,message.slice(0,300),detail,JSON.stringify(clean),now());}catch{/* the database itself may be the problem */}
 try{const c=await serviceConfig(true);if(c.sentryDsn)await toSentry(c.sentryDsn,source,level,message,detail,clean);}catch{/* never let tracking break the request */}
}

/** Recent errors for Admin → Operations. */
export async function recentErrors(limit=25){
 const [rows,counts]=await Promise.all([
  all('SELECT id,source,level,message,detail,context,created_at FROM error_events ORDER BY created_at DESC LIMIT ?',limit),
  all('SELECT source,COUNT(*) AS n FROM error_events WHERE created_at>? GROUP BY source',now()-86400000),
 ]);
 return {errors:rows.map(r=>({id:r.id as string,source:r.source as string,level:r.level as string,message:r.message as string,detail:r.detail as string,context:JSON.parse((r.context as string)||'{}') as Context,createdAt:r.created_at as number})),
  last24h:Object.fromEntries(counts.map(c=>[c.source as string,Number(c.n)]))};
}

export async function pruneErrors(){await run('DELETE FROM error_events WHERE created_at<?',now()-30*86400000);}
