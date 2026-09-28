import {serviceConfig} from './connections';
import {config,must,now,parse,type Row} from './data';
import type {WorkflowStep} from '../contracts';
export type AIRequest={step:WorkflowStep;input:Row;idempotencyKey:string;templateSlug:string};
export type ProviderStatus={status:'processing'|'completed'|'failed';url?:string;error?:string;mime?:string};
export interface AIProvider{generateImage(r:AIRequest):Promise<string>;generateVideo(r:AIRequest):Promise<string>;getStatus(jobId:string):Promise<ProviderStatus>;cancelJob(jobId:string):Promise<void>}
export function interpolate(value:string,vars:Record<string,string>):string{return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>{must(Object.prototype.hasOwnProperty.call(vars,k),'Workflow variable is missing: '+k);return vars[k]});}
export function buildInput(step:WorkflowStep,vars:Record<string,string>){const resolve=(v:any):any=>typeof v==='string'?interpolate(v,vars):Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,val])=>[k,resolve(val)])):v;const result:Row={...resolve(step.settings),...Object.fromEntries(Object.entries(step.inputs).map(([k,v])=>[k,interpolate(v,vars)]))};if(step.prompt)result.prompt=interpolate(step.prompt,vars);if(step.negativePrompt)result.negative_prompt=interpolate(step.negativePrompt,vars);return result;}
export class MockAIProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){must(config().demo,'The development AI provider is disabled.',403);return JSON.stringify({start:now(),slug:r.templateSlug,fail:r.step.settings.simulateFailure===true,type:r.step.type});}
 async getStatus(jobId:string):Promise<ProviderStatus>{must(config().demo,'The development AI provider is disabled.',403);const j=parse<Row>(jobId,{});if(now()-j.start<6500)return {status:'processing'};if(j.fail)return {status:'failed',error:'Simulated provider failure for workflow testing.'};return {status:'completed',url:`/media/${j.slug}.${['image','transform'].includes(j.type)?'webp':'mp4'}`,mime:['image','transform'].includes(j.type)?'image/webp':'video/mp4'};}
 async cancelJob(){return;}
}
function falUrl(url:string){const u=new URL(url);must(u.protocol==='https:'&&u.hostname==='queue.fal.run','Invalid fal queue URL.');return u.toString();}
async function falFetch(url:string,method='GET',body?:Row){const r=await fetch(falUrl(url),{method,headers:{Authorization:`Key ${(await serviceConfig()).falKey}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});if(!r.ok)throw new Error(`fal returned HTTP ${r.status}`);return r.json() as Promise<Row>;}
export class FalProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){must((await serviceConfig()).falKey,'fal API key is not configured.',503);must(/^[\w.-]+\/[\w./-]+$/.test(r.step.model),'Invalid fal endpoint.');const d=await falFetch('https://queue.fal.run/'+r.step.model,'POST',r.input);must(d.request_id&&d.status_url&&d.response_url&&d.cancel_url,'fal did not return a durable job handle.');return JSON.stringify({id:d.request_id,status:falUrl(d.status_url),result:falUrl(d.response_url),cancel:falUrl(d.cancel_url)});}
 async getStatus(jobId:string):Promise<ProviderStatus>{const j=parse<Row>(jobId,{});const s=await falFetch(j.status);if(s.error)return {status:'failed',error:String(s.error)};if(s.status!=='COMPLETED')return {status:'processing'};const r=await falFetch(j.result);const url=r.video?.url||r.images?.[0]?.url||r.image?.url||r.output?.url;return url?{status:'completed',url,mime:r.video?'video/mp4':'image/png'}:{status:'failed',error:'Provider result did not contain a supported image or video.'};}
 async cancelJob(jobId:string){const j=parse<Row>(jobId,{});await falFetch(j.cancel,'PUT');}
}
async function replicateFetch(path:string,method='GET',body?:Row){const c=await serviceConfig();must(c.replicateKey,'Replicate API token is not configured.',503);const r=await fetch('https://api.replicate.com/v1/'+path,{method,headers:{Authorization:`Bearer ${c.replicateKey}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});if(!r.ok)throw new Error('Replicate returned HTTP '+r.status);return r.json() as Promise<Row>;}
export class ReplicateProvider implements AIProvider{
 async generateImage(r:AIRequest){return this.generateVideo(r)}
 async generateVideo(r:AIRequest){const m=r.step.model;must(/^[\w.-]+\/[\w.-]+$/.test(m),'Use a Replicate owner/model identifier.');const d=await replicateFetch(`models/${m}/predictions`,'POST',{input:r.input});return d.id;}
 async getStatus(jobId:string):Promise<ProviderStatus>{must(/^[\w-]+$/.test(jobId),'Invalid provider job ID.');const r=await replicateFetch('predictions/'+jobId);if(['failed','canceled'].includes(r.status))return {status:'failed',error:String(r.error||'Provider cancelled the job')};if(r.status!=='succeeded')return {status:'processing'};const output=Array.isArray(r.output)?r.output[0]:r.output;const url=typeof output==='string'?output:output?.url;return url?{status:'completed',url,mime:/\.(mp4|webm)(\?|$)/.test(url)?'video/mp4':'image/png'}:{status:'failed',error:'Unsupported provider output.'};}
 async cancelJob(id:string){must(/^[\w-]+$/.test(id),'Invalid job ID.');await replicateFetch(`predictions/${id}/cancel`,'POST');}
}
export const providers:Record<string,AIProvider>={mock:new MockAIProvider(),fal:new FalProvider(),replicate:new ReplicateProvider()};
export const providerFor=(id:string)=>{const p=providers[id];must(p,'This provider adapter is not installed.',422);return p;};
