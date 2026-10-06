import {serviceConfig} from './connections';
import {config,must,now,parse,type Row} from './data';
import type {WorkflowStep} from '../contracts';
export type AIRequest={step:WorkflowStep;input:Row;idempotencyKey:string;templateSlug:string};
export type ProviderStatus={status:'processing'|'completed'|'failed'|'refused';url?:string;error?:string;mime?:string};
/** A provider declined the request under its content rules. Unlike a failure, it is never retried and counts as a strike. */
export class ProviderRefusal extends Error{}
const refusalWords=/nsfw|content[ _-]?(policy|moderation|filter)|safety (check|filter|system)|moderation|inappropriate|sensitive content|flagged/i;
export const isRefusal=(message:string)=>refusalWords.test(message);
export interface AIProvider{generateImage(r:AIRequest):Promise<string>;generateVideo(r:AIRequest):Promise<string>;getStatus(jobId:string):Promise<ProviderStatus>;cancelJob(jobId:string):Promise<void>}
export function interpolate(value:string,vars:Record<string,string>):string{return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>{must(Object.prototype.hasOwnProperty.call(vars,k),'Workflow variable is missing: '+k);return vars[k]});}
export function buildInput(step:WorkflowStep,vars:Record<string,string>){const resolve=(v:unknown):unknown=>typeof v==='string'?interpolate(v,vars):Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,val])=>[k,resolve(val)])):v;const result:Row={...resolve(step.settings) as Row,...Object.fromEntries(Object.entries(step.inputs).map(([k,v])=>[k,interpolate(v,vars)]))};if(step.prompt)result.prompt=interpolate(step.prompt,vars);if(step.negativePrompt)result.negative_prompt=interpolate(step.negativePrompt,vars);return result;}
export class MockAIProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){must(config().demo,'The development AI provider is disabled.',403);return JSON.stringify({start:now(),slug:r.templateSlug,fail:r.step.settings.simulateFailure===true,refuse:r.step.settings.simulateRefusal===true,type:r.step.type});}
 async getStatus(jobId:string):Promise<ProviderStatus>{must(config().demo,'The development AI provider is disabled.',403);const j=parse<Row>(jobId,{});if(j.refuse)return {status:'refused',error:'Simulated content refusal for workflow testing.'};if(now()-j.start<6500)return {status:'processing'};if(j.fail)return {status:'failed',error:'Simulated provider failure for workflow testing.'};return {status:'completed',url:`/media/${j.slug}.${['image','transform'].includes(j.type)?'webp':'mp4'}`,mime:['image','transform'].includes(j.type)?'image/webp':'video/mp4'};}
 async cancelJob(){return;}
}
function falUrl(url:string){const u=new URL(url);must(u.protocol==='https:'&&u.hostname==='queue.fal.run','Invalid fal queue URL.');return u.toString();}
async function falFetch(url:string,method='GET',body?:Row){const r=await fetch(falUrl(url),{method,headers:{Authorization:`Key ${(await serviceConfig()).falKey}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});if(!r.ok){const detail=(await r.text().catch(()=>'')).slice(0,300);const message=`fal returned HTTP ${r.status}${detail?': '+detail:''}`;throw isRefusal(detail)?new ProviderRefusal(message):new Error(message);}return r.json() as Promise<Row>;}
export class FalProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){must((await serviceConfig()).falKey,'fal API key is not configured.',503);must(/^[\w.-]+\/[\w./-]+$/.test(r.step.model),'Invalid fal endpoint.');const d=await falFetch('https://queue.fal.run/'+r.step.model,'POST',r.input);must(d.request_id&&d.status_url&&d.response_url&&d.cancel_url,'fal did not return a durable job handle.');return JSON.stringify({id:d.request_id,status:falUrl(d.status_url),result:falUrl(d.response_url),cancel:falUrl(d.cancel_url)});}
 async getStatus(jobId:string):Promise<ProviderStatus>{const j=parse<Row>(jobId,{});const s=await falFetch(j.status);if(s.error)return {status:isRefusal(String(s.error))?'refused':'failed',error:String(s.error)};if(s.status!=='COMPLETED')return {status:'processing'};const r=await falFetch(j.result);if(Array.isArray(r.has_nsfw_concepts)&&r.has_nsfw_concepts.some(Boolean))return {status:'refused',error:'The provider flagged the result as not safe for work.'};const url=r.video?.url||r.images?.[0]?.url||r.image?.url||r.output?.url;return url?{status:'completed',url,mime:r.video?'video/mp4':'image/png'}:{status:'failed',error:'Provider result did not contain a supported image or video.'};}
 async cancelJob(jobId:string){const j=parse<Row>(jobId,{});await falFetch(j.cancel,'PUT');}
}
async function replicateFetch(path:string,method='GET',body?:Row){const c=await serviceConfig();must(c.replicateKey,'Replicate API token is not configured.',503);const r=await fetch('https://api.replicate.com/v1/'+path,{method,headers:{Authorization:`Bearer ${c.replicateKey}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});if(!r.ok)throw new Error('Replicate returned HTTP '+r.status);return r.json() as Promise<Row>;}
export class ReplicateProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){const m=r.step.model;must(/^[\w.-]+\/[\w.-]+$/.test(m),'Use a Replicate owner/model identifier.');const d=await replicateFetch(`models/${m}/predictions`,'POST',{input:r.input});return d.id;}
 async getStatus(jobId:string):Promise<ProviderStatus>{must(/^[\w-]+$/.test(jobId),'Invalid provider job ID.');const r=await replicateFetch('predictions/'+jobId);if(['failed','canceled'].includes(r.status)){const error=String(r.error||'Provider cancelled the job');return {status:isRefusal(error)?'refused':'failed',error};}if(r.status!=='succeeded')return {status:'processing'};const output=Array.isArray(r.output)?r.output[0]:r.output;const url=typeof output==='string'?output:output?.url;return url?{status:'completed',url,mime:/\.(mp4|webm)(\?|$)/.test(url)?'video/mp4':'image/png'}:{status:'failed',error:'Unsupported provider output.'};}
 async cancelJob(id:string){must(/^[\w-]+$/.test(id),'Invalid job ID.');await replicateFetch(`predictions/${id}/cancel`,'POST');}
}
// Higgsfield (https://higgsfield.ai): POST /<model> queues a job; GET /requests/<id>/status reports
// queued | in_progress | completed | failed | nsfw. A request refused as NSFW is not charged by Higgsfield.
const HIGGSFIELD='https://api.higgsfield.ai';
async function higgsfieldFetch(path:string,method='GET',body?:Row){
 const c=await serviceConfig();must(c.higgsfieldKey&&c.higgsfieldSecret,'Higgsfield API key is not configured.',503);
 const r=await fetch(HIGGSFIELD+path,{method,headers:{Authorization:`Key ${c.higgsfieldKey}:${c.higgsfieldSecret}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});
 if(!r.ok){
  const detail=(await r.text().catch(()=>'')).slice(0,300);
  // 401: wrong key; 403: the Higgsfield account is out of credits. Both need the studio owner, not the customer.
  const message=r.status===401?'Higgsfield rejected the API key.':r.status===403?'The Higgsfield account has run out of credits. Top up Higgsfield to continue.':`Higgsfield returned HTTP ${r.status}${detail?': '+detail:''}`;
  if(r.status===401||r.status===403)console.error(message);
  throw isRefusal(detail)?new ProviderRefusal(message):new Error(message);
 }
 return r.json() as Promise<Row>;
}
export class HiggsfieldProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){
  must(/^\/?[\w.-]+(\/[\w.-]+)*$/.test(r.step.model),'Invalid Higgsfield model endpoint.');
  const d=await higgsfieldFetch('/'+r.step.model.replace(/^\//,''),'POST',r.input);
  must(typeof d.request_id==='string'&&/^[\w-]+$/.test(d.request_id),'Higgsfield did not return a request ID.');
  return d.request_id;
 }
 async getStatus(jobId:string):Promise<ProviderStatus>{
  must(/^[\w-]+$/.test(jobId),'Invalid provider job ID.');
  const s=await higgsfieldFetch('/requests/'+jobId+'/status');
  if(s.status==='nsfw')return {status:'refused',error:'Higgsfield refused the content (NSFW).'};
  if(s.status==='failed'||s.status==='canceled'||s.status==='cancelled'){const error=String(s.error||s.detail||'Higgsfield could not complete the request.');return {status:isRefusal(error)?'refused':'failed',error};}
  if(s.status!=='completed')return {status:'processing'};
  const video=s.video?.url,image=Array.isArray(s.images)?s.images[0]?.url:undefined;
  return video?{status:'completed',url:video,mime:'video/mp4'}:image?{status:'completed',url:image,mime:'image/png'}:{status:'failed',error:'Higgsfield result did not contain a supported image or video.'};
 }
 async cancelJob(jobId:string){must(/^[\w-]+$/.test(jobId),'Invalid job ID.');await higgsfieldFetch('/requests/'+jobId+'/cancel','POST').catch(()=>{/* Requests already processing cannot be cancelled. */});}
}
export const providers:Record<string,AIProvider>={mock:new MockAIProvider(),fal:new FalProvider(),replicate:new ReplicateProvider(),higgsfield:new HiggsfieldProvider()};
export const providerFor=(id:string)=>{const p=providers[id];must(p,'This provider adapter is not installed.',422);return p;};
