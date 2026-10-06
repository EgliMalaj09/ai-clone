// A local stand-in for the Higgsfield API, shaped like the official SDKs (higgsfield-js, higgsfield-client):
// POST /<model> queues a job, GET /requests/<id>/status reports queued | in_progress | completed | failed | nsfw,
// POST /requests/<id>/cancel cancels. Results are served from a CDN host the app must accept.
// Tests choose an outcome per model with outcome(model, 'completed' | 'nsfw' | 'failed' | 'no-credits').

export function fakeHiggsfield({keyId,keySecret,Response,image,video}){
 const jobs=new Map(),submitted=[],outcomes=new Map();let serial=0;
 const json=(data,status=200)=>Response.json(data,{status});
 const cdn='https://d1higgsfield.cloudfront.net';
 return {
  jobs,submitted,
  outcome:(model,result)=>outcomes.set(model,result),
  matches:url=>url.hostname==='api.higgsfield.ai'||url.origin===cdn,
  async handle(req){
   const url=new URL(req.url);
   if(url.origin===cdn){const bytes=url.pathname.endsWith('.mp4')?video:image;return new Response(bytes,{headers:{'Content-Length':String(bytes.length),'Content-Type':url.pathname.endsWith('.mp4')?'video/mp4':'image/png'}});}
   if(req.headers.get('authorization')!==`Key ${keyId}:${keySecret}`)return json({detail:'Invalid API credentials'},401);
   const status=url.pathname.match(/^\/requests\/([\w-]+)\/status$/);
   if(status&&req.method==='GET'){
    const job=jobs.get(status[1]);if(!job)return json({detail:'Not found'},404);
    // The first check reports the job as still running, like a real queue.
    if(!job.checked){job.checked=true;return json({status:'in_progress',request_id:job.id});}
    if(job.outcome==='nsfw')return json({status:'nsfw',request_id:job.id});
    if(job.outcome==='failed')return json({status:'failed',request_id:job.id,error:'Model could not process the image'});
    return json({status:'completed',request_id:job.id,...(job.isVideo?{video:{url:`${cdn}/${job.id}.mp4`}}:{images:[{url:`${cdn}/${job.id}.png`}]})});
   }
   if(/^\/requests\/[\w-]+\/cancel$/.test(url.pathname)&&req.method==='POST')return json({status:'canceled'});
   if(req.method==='POST'){
    const model=url.pathname.slice(1),input=await req.json(),result=outcomes.get(model)||'completed';
    if(result==='no-credits')return json({detail:'Not enough credits'},403);
    const id='hf_'+(++serial);submitted.push({model,input});
    jobs.set(id,{id,model,input,outcome:result,isVideo:/video/.test(model)});
    return json({status:'queued',request_id:id,status_url:`https://api.higgsfield.ai/requests/${id}/status`,cancel_url:`https://api.higgsfield.ai/requests/${id}/cancel`});
   }
   throw new Error('Unexpected Higgsfield call: '+req.method+' '+url.pathname);
  },
 };
}
