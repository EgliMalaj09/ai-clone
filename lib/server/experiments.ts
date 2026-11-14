import {z} from 'zod';
import {all,audit,must,now,one,run,uid,type Row} from './data';
import type {PublicTemplate,StudioUser} from '../contracts';

// A/B tests (V16): a second preview (thumbnail/video) or a second credit cost for one template. Signed-in customers are
// split in two by their account, so each always sees the same version; guests always see version A (no tracking cookie).
// Views and creations are counted per version from the studio's own events.

const fnv=(s:string)=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;};
export const variantFor=(userId:string|null|undefined,experimentId:string):'A'|'B'=>userId&&fnv(userId+':'+experimentId)%2===1?'B':'A';

export async function runningExperiments(){return all("SELECT * FROM template_experiments WHERE status='running'");}
/** The template as this customer sees it, with version B's preview or price when they are in group B. */
export function applyExperiment<T extends Pick<PublicTemplate,'id'|'thumbnail'|'previewVideo'|'creditCost'>>(t:T,exps:Row[],userId:string|null|undefined):T{
 const e=exps.find(x=>x.template_id===t.id);if(!e||variantFor(userId,e.id as string)==='A')return t;
 return e.kind==='price'?{...t,creditCost:Number(e.credit_cost_b)}:{...t,thumbnail:(e.thumbnail_b as string)||t.thumbnail,previewVideo:(e.preview_video_b as string)||t.previewVideo};
}
export async function applyExperiments<T extends Pick<PublicTemplate,'id'|'thumbnail'|'previewVideo'|'creditCost'>>(list:T[],userId:string|null|undefined){
 if(!list.length)return list;const exps=await runningExperiments();return exps.length?list.map(t=>applyExperiment(t,exps,userId)):list;
}
/** For events: which test and version this customer is in for a template. */
export async function experimentTag(templateId:string|null|undefined,userId:string|null|undefined){
 if(!templateId)return {};const e=await one("SELECT id FROM template_experiments WHERE template_id=? AND status='running'",templateId);
 return e?{experimentId:e.id as string,variant:variantFor(userId,e.id as string)}:{};
}

const startSchema=z.object({kind:z.enum(['preview','price']),thumbnailB:z.string().max(500).optional(),previewVideoB:z.string().max(500).optional(),creditCostB:z.number().int().min(1).max(1000000).optional()})
 .refine(b=>b.kind==='price'?!!b.creditCostB:!!(b.thumbnailB||b.previewVideoB),{message:'Set version B: a new credit cost, or a new thumbnail or preview video.'});
export async function startExperiment(admin:StudioUser,templateId:string,input:unknown){
 const b=startSchema.parse(input);const t=await one('SELECT id,credit_cost FROM templates WHERE id=?',templateId);must(t,'Template not found.',404);
 must(!await one("SELECT id FROM template_experiments WHERE template_id=? AND status='running'",templateId),'This template already has a test running. Stop it first.',409);
 if(b.kind==='price')must(b.creditCostB!==Number(t.credit_cost),'Version B needs a different credit cost.');
 for(const url of [b.thumbnailB,b.previewVideoB])if(url)must(/^\/(api\/media\/|media\/)/.test(url),'Use a file from the media library for version B.');
 const id=uid('exp_');await run('INSERT INTO template_experiments (id,template_id,kind,thumbnail_b,preview_video_b,credit_cost_b,started_at,created_by) VALUES (?,?,?,?,?,?,?,?)',id,templateId,b.kind,b.thumbnailB||null,b.previewVideoB||null,b.kind==='price'?b.creditCostB:null,now(),admin.id);
 await audit(admin.id,'experiment.start',id);return {id};
}
export async function stopExperiment(admin:StudioUser,id:string){const r=await one("UPDATE template_experiments SET status='stopped',ended_at=? WHERE id=? AND status='running' RETURNING id",now(),id);must(r,'This test is not running.',409);await audit(admin.id,'experiment.stop',id);return {ok:true};}
/** Results per version: views and creations by signed-in customers, conversion, and credits from those creations. */
export async function experimentResults(templateId:string){
 const exps=await all('SELECT * FROM template_experiments WHERE template_id=? ORDER BY started_at DESC LIMIT 10',templateId);
 const out=[];
 for(const e of exps){
  const rows=await all("SELECT name,json_extract(metadata,'$.variant') AS variant,COUNT(*) AS n,COALESCE(SUM(json_extract(metadata,'$.credits')),0) AS credits FROM analytics_events WHERE json_extract(metadata,'$.experimentId')=? AND name IN ('template_view','generation_requested') GROUP BY name,variant",e.id);
  const stat=(v:string)=>{const views=Number(rows.find(r=>r.name==='template_view'&&r.variant===v)?.n||0),g=rows.find(r=>r.name==='generation_requested'&&r.variant===v);const creations=Number(g?.n||0);return {views,creations,conversion:views?creations/views:null,credits:Number(g?.credits||0)};};
  out.push({id:e.id as string,kind:e.kind as string,status:e.status as string,startedAt:e.started_at as number,endedAt:(e.ended_at as number|null)??null,b:{thumbnail:(e.thumbnail_b as string|null)??null,previewVideo:(e.preview_video_b as string|null)??null,creditCost:(e.credit_cost_b as number|null)??null},A:stat('A'),B:stat('B')});
 }
 return {experiments:out};
}
