import {all,now,stmt,batch} from './data';

/** Who advanced the queue: the Worker's own cron trigger, or an external scheduler calling /api/queue/dispatch. */
export type DispatchSource='cron'|'external';

/** A dispatcher run older than this counts as stopped; purchases and new creations close. */
export const DISPATCH_FRESH_MS=180000;

/** Records that a trusted dispatcher ran. Only the scheduled() handler and the QUEUE_SECRET endpoint call this. */
export async function recordDispatch(source:DispatchSource){
 const upsert="INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
 await batch([stmt(upsert,'queue_dispatch_heartbeat',String(now())),stmt(upsert,'queue_dispatch_source',source)]);
}

export async function dispatcherStatus(){
 const rows=await all("SELECT key,value FROM app_settings WHERE key IN ('queue_dispatch_heartbeat','queue_dispatch_source')");
 const at=Number(rows.find(r=>r.key==='queue_dispatch_heartbeat')?.value)||null;
 const recorded=rows.find(r=>r.key==='queue_dispatch_source')?.value;
 const source:DispatchSource|null=at?(recorded==='cron'?'cron':'external'):null;
 return {at,source,fresh:!!at&&at>now()-DISPATCH_FRESH_MS};
}
