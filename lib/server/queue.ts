import {all,batch,config,event,must,now,one,parse,run,stmt,uid,type Row} from './data';
import type {WorkflowStep} from '../contracts';
import {buildInput,providerFor} from './providers';
import {ingestRemote,mediaUrl,storage} from './storage';
import {refundOrder} from './payments';
import {demoVideos} from './demo-assets';
import {sweepTemplateMedia} from './template-media';

const active=['queued','preparing','generating','finalizing'];
export async function failGeneration(g:Row,error:string){
 const result=await run("UPDATE generations SET status='failed',error=?,internal_error=?,lease_until=0,completed_at=? WHERE id=? AND deleted_at IS NULL AND status IN ('queued','preparing','generating','finalizing') AND lease_token=?",'Your video could not be completed. You can review its payment in Orders.',error.slice(0,2000),now(),g.id,g.lease_token);
 if(!result.meta.changes)return;
 await run("UPDATE generation_steps SET status='failed',error=? WHERE generation_id=? AND status NOT IN ('completed','cancelled')",error.slice(0,2000),g.id);
 await event('generation_failed',g.user_id,{generationId:g.id});
 const s=await one("SELECT value FROM app_settings WHERE key='auto_refund'");
 if(s?s.value==='true':config().autoRefund){const o=await one('SELECT id FROM orders WHERE generation_id=? AND status=?',g.id,'paid');if(o)try{await refundOrder(o.id)}catch{console.error('Automatic refund needs review',o.id)}}
}
export async function tickGeneration(id:string){
 const token=uid();const g=await one("UPDATE generations SET lease_token=?,lease_until=? WHERE id=? AND status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL AND lease_until<? AND next_run_at<=? AND EXISTS (SELECT 1 FROM orders WHERE orders.generation_id=generations.id AND orders.status='paid') RETURNING *",token,now()+45000,id,now(),now());if(!g)return;
 try{
  const elapsed=now()-(g.started_at||now());if(elapsed>30*60*1000){await failGeneration(g,'Generation exceeded the 30 minute deadline.');return;}
  const snapshot=parse<Row>(g.workflow_snapshot,{});const steps=snapshot.steps as WorkflowStep[];const i=g.current_step;
  must(config().demo||steps.every(s=>s.provider!=='mock'),'A development workflow cannot run in production.',403);
  if(g.status==='queued'){await run("UPDATE generations SET status='preparing',started_at=COALESCE(started_at,?),next_run_at=? WHERE id=? AND lease_token=?",now(),now()+500,id,token);await event('generation_started',g.user_id,{generationId:id});return;}
  if(g.status==='finalizing'){
   const asset=await one("SELECT id FROM generated_assets WHERE generation_id=? ORDER BY created_at DESC LIMIT 1",id);must(asset,'No output asset was saved.');
   const completed=await run("UPDATE generations SET status='completed',completed_at=?,error=NULL WHERE id=? AND lease_token=? AND status='finalizing' AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM orders WHERE generation_id=? AND status='paid')",now(),id,token,id);if(completed.meta.changes)await event('generation_completed',g.user_id,{generationId:id});return;
  }
  const step=steps[i];must(step,'Workflow has no executable step.');const p=providerFor(step.provider);const stepId=id+'_'+i;const record=await one('SELECT * FROM generation_steps WHERE id=?',stepId);
  if(record?.status==='completed'){await run("UPDATE generations SET current_step=current_step+1,status=?,next_run_at=? WHERE id=? AND lease_token=?",i+1>=steps.length?'finalizing':'preparing',now()+500,id,token);return;}
  if(record?.status==='submitting'&&!record.provider_job_id){
   // Do not submit again after an ambiguous network failure: the provider may have billed it.
   await failGeneration(g,'Provider submission was interrupted. Reconcile with the provider before retrying.');return;
  }
  if(!record){
   const vars:Record<string,string>={template_name:snapshot.name,aspect_ratio:step.aspectRatio||snapshot.aspectRatio,duration:String(step.duration||snapshot.duration)};
   // Store asset identities, not expiring bearer links, between steps and retries.
   for(const [name,value] of Object.entries(parse<Record<string,string>>(g.context,{}))){
    const asset=value.startsWith('asset_')?value:value.match(/\/api\/media\/(asset_[a-zA-Z0-9_]+)/)?.[1];
    must(asset&&await one('SELECT id FROM generated_assets WHERE id=? AND generation_id=?',asset,id),'An intermediate workflow asset is unavailable.');
    vars[name]=await mediaUrl(asset);
   }
   const ids=parse<string[]>(g.input_ids,[]);for(let n=0;n<ids.length;n++){must(await one('SELECT id FROM user_uploads WHERE id=? AND user_id=?',ids[n],g.user_id),'An input photo was removed.');vars['user_image_'+(n+1)]=await mediaUrl(ids[n]);}
   const input=buildInput(step,vars);
   await run('INSERT INTO generation_steps (id,generation_id,step_order,type,provider,model,status,started_at) VALUES (?,?,?,?,?,?,?,?)',stepId,id,i,step.type,step.provider,step.model,'submitting',now());
   const request={step,input,idempotencyKey:stepId,templateSlug:snapshot.slug};
   const jobId=await (['image','transform'].includes(step.type)?p.generateImage(request):p.generateVideo(request));
   const owned=await one("SELECT id FROM generations WHERE id=? AND lease_token=? AND status IN ('preparing','generating')",id,token);if(!owned){await run("UPDATE generation_steps SET provider_job_id=?,status='cancelled' WHERE id=?",jobId,stepId);try{await p.cancelJob(jobId)}catch{console.error('Provider cancellation needs review',id)}return;}
   await batch([stmt("UPDATE generation_steps SET provider_job_id=?,status='generating' WHERE id=?",jobId,stepId),stmt("UPDATE generations SET status='generating',attempts=0,next_run_at=? WHERE id=? AND lease_token=?",now()+1500,id,token)]);return;
  }
  const result=await p.getStatus(record.provider_job_id);if(result.status==='processing'){await run('UPDATE generations SET next_run_at=? WHERE id=? AND lease_token=?',now()+1500,id,token);return;}
  if(result.status==='failed'){await failGeneration(g,result.error||'Provider failed.');return;}
  must(result.url,'The provider returned no output.');const assetId='asset_'+stepId;let mime=result.mime||'video/mp4';const key=`generated/${g.user_id}/${id}/${i}.${mime.startsWith('video')?'mp4':'png'}`;let size=0;
  if(step.provider==='mock'){
    // Demo output is a bundled concept clip, never a claimed transformation of an upload.
    const b64=demoVideos[snapshot.slug]||demoVideos['formula-driver'];const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));size=bytes.length;
    if(['image','transform'].includes(step.type)){const input=await one('SELECT storage_key,mime,size FROM user_uploads WHERE id=?',parse<string[]>(g.input_ids,[])[0]);must(input,'Demo input missing.');const object=await storage.get(input.storage_key);must(object,'Demo input unavailable.');await storage.put(key,object.body,input.mime);size=input.size;mime=input.mime;}
    else await storage.put(key,bytes,'video/mp4');
  }else {const saved=await ingestRemote(result.url,key);size=saved.size;mime=saved.mime;}
  const fresh=await one('SELECT deleted_at,status,lease_token FROM generations WHERE id=?',id);if(!fresh||fresh.deleted_at||!active.includes(fresh.status)||fresh.lease_token!==token){await storage.delete(key);return;}
  const context={...parse(g.context,{}),previous_output:assetId,[step.output||'previous_output']:assetId};
  const saved=await batch([stmt('INSERT OR IGNORE INTO generated_assets (id,generation_id,user_id,storage_key,mime,kind,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM generations WHERE id=? AND lease_token=?)',assetId,id,g.user_id,key,mime,i===steps.length-1?'output':'intermediate',size,now(),id,token),stmt("UPDATE generation_steps SET status='completed',result=?,completed_at=? WHERE id=? AND EXISTS (SELECT 1 FROM generations WHERE id=? AND lease_token=?)",assetId,now(),stepId,id,token),stmt('UPDATE generations SET context=?,current_step=?,status=?,next_run_at=?,attempts=0 WHERE id=? AND lease_token=?',JSON.stringify(context),i+1,i+1>=steps.length?'finalizing':'preparing',now()+1000,id,token)]);if(!saved[0].meta.changes&&!await one('SELECT id FROM generated_assets WHERE id=?',assetId))await storage.delete(key);
 }catch(e){const message=e instanceof Error?e.message:'Generation failed';const submitting=await one("SELECT id FROM generation_steps WHERE generation_id=? AND status='submitting' AND provider_job_id IS NULL",id);if(submitting||g.attempts>=2){await failGeneration(g,message)}else await run('UPDATE generations SET attempts=attempts+1,next_run_at=?,internal_error=? WHERE id=? AND lease_token=?',now()+Math.pow(2,g.attempts)*2000,message.slice(0,2000),id,token);
 }finally{await run('UPDATE generations SET lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?',id,token);}
}
export async function tickQueue(userId?:string){
 const maintenance=await one("INSERT INTO app_settings (key,value) VALUES ('last_maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(value AS INTEGER)<? RETURNING value",String(now()),now()-3600000);
 if(maintenance){await batch([stmt('DELETE FROM rate_limits WHERE reset_at<?',now()-3600000),stmt('DELETE FROM sessions WHERE expires_at<?',now()),stmt('DELETE FROM auth_tokens WHERE expires_at<?',now())]);await sweepTemplateMedia().catch(e=>console.error('Template media sweep needs another run',e instanceof Error?e.message:'unknown'));}
 await run("INSERT INTO app_settings (key,value) VALUES ('queue_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(now()));const rows=await all("SELECT id FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND next_run_at<=? AND lease_until<? AND deleted_at IS NULL"+(userId?' AND user_id=?':'')+' ORDER BY created_at LIMIT 5',now(),now(),...(userId?[userId]:[]));await Promise.allSettled(rows.map(g=>tickGeneration(g.id)));return rows.length;}
export async function removeGeneration(id:string,userId:string){const g=await one('SELECT * FROM generations WHERE id=? AND user_id=? AND deleted_at IS NULL',id,userId);must(g,'Creation not found.',404);must(!active.includes(g.status),'Please wait for the running generation to finish before deleting it.',409);const assets=await all('SELECT * FROM generated_assets WHERE generation_id=?',id);for(const a of assets)await storage.delete(a.storage_key);await batch([stmt('DELETE FROM generated_assets WHERE generation_id=?',id),stmt("UPDATE generations SET deleted_at=?,context='{}',input_ids='[]' WHERE id=?",now(),id)]);}
