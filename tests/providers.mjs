// Contract tests for live-mode adapters. Every external response is a local fixture.
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,Response:MFResponse}=require('miniflare');
const server=path.resolve('dist/server');
const modules=(await readdir(server,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b)).map(f=>({type:'ESModule',path:path.join(server,f)}));
const image=await readFile('public/media/formula-driver.webp'),video=await readFile('public/media/formula-driver.mp4');
const password=randomBytes(20).toString('hex'),salt=randomBytes(32).toString('hex');
const env={PUBLIC_SERVICE_ACCESS:'true',RESEND_API_KEY:'re_fixture',MAIL_FROM:'hello@studio.test',QUEUE_SECRET:randomBytes(32).toString('hex'),DEMO_MODE:'false',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),FAL_KEY:'fal_fixture',REPLICATE_API_TOKEN:'replicate_fixture'};
const jobs=new Map();const inputs=[];let serial=0;const requests=[];
const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:env,d1Databases:{DB:'providers-fixture'},r2Buckets:['BUCKET'],cf:false,outboundService:async req=>{
 const u=new URL(req.url);requests.push({host:u.hostname,path:u.pathname,method:req.method});
 if(u.hostname==='queue.fal.run'){
  if(req.method==='POST'){const input=await req.json();inputs.push(input);const id='fal_'+(++serial);jobs.set(id,input);return MFResponse.json({request_id:id,status_url:'https://queue.fal.run/status/'+id,response_url:'https://queue.fal.run/result/'+id,cancel_url:'https://queue.fal.run/cancel/'+id});}
  const input=jobs.get(u.pathname.split('/').at(-1));assert(input,'Unknown fal fixture');
  if(u.pathname.startsWith('/status/'))return MFResponse.json({status:'COMPLETED'});
  if(u.pathname.startsWith('/result/'))return MFResponse.json(input.outputKind==='image'?{images:[{url:'https://v3.fal.media/example.webp'}]}:{video:{url:input.unsafe?'https://127.0.0.1/private':'https://v3.fal.media/example.mp4'}});
  if(u.pathname.startsWith('/cancel/'))return MFResponse.json({ok:true});
 }
 if(u.hostname==='api.replicate.com'){
  if(req.method==='POST'){const {input}=await req.json();inputs.push(input);const id='rep_'+(++serial);jobs.set(id,input);return MFResponse.json({id,status:'starting'});}
  return MFResponse.json({status:'succeeded',output:'https://replicate.delivery/example.mp4'});
 }
 if(u.hostname==='v3.fal.media'||u.hostname==='replicate.delivery'){
  const bytes=u.pathname.endsWith('.webp')?image:video;
  return new MFResponse(bytes,{headers:{'Content-Type':u.pathname.endsWith('.webp')?'image/webp':'video/mp4','Content-Length':String(bytes.length)}});
 }
 throw new Error('No external network allowed: '+u.hostname);
}});
const checks=[];const ok=(name,value=true)=>{assert(value,name);checks.push({name,passed:true});console.log('PASS',name)};
async function request(route,{method='GET',data,cookie,expected=200}={}){
 const r=await mf.dispatchFetch(env.APP_ORIGIN+route,{method,headers:{origin:env.APP_ORIGIN,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}assert.equal(r.status,expected,route+': '+text.slice(0,200));return {body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function finish(cookie,id){const deadline=Date.now()+25000;while(Date.now()<deadline){await request('/api/queue/tick',{method:'POST',data:{},cookie});const g=(await request('/api/generations/'+id,{cookie})).body.generations[0];if(['completed','failed'].includes(g.status))return g;await new Promise(r=>setTimeout(r,600));}throw new Error('Provider workflow did not finish');}
try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const cookie=(await request('/api/auth/login',{method:'POST',data:{email:env.ADMIN_EMAIL,password}})).cookie;
 for(const provider of ['fal','replicate'])await request('/api/admin/providers/'+provider,{method:'PATCH',cookie,data:{enabled:true}});
 await db.prepare("INSERT INTO app_settings (key,value) VALUES ('queue_dispatch_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(Date.now())).run();
 const template=(await request('/api/admin/templates/tpl_formula-driver',{cookie})).body.template;
 await request('/api/admin/templates/'+template.id,{method:'PATCH',cookie,data:{...template,workflow:[{...template.workflow[0],type:'video',provider:'mock',model:'studio-demo'}]}});
 const uploadId='up_adapter_fixture',owner=(await request('/api/me',{cookie})).body.user.id;const bucket=await mf.getR2Bucket('BUCKET');await bucket.put('uploads/adapter/photo',image);
 await db.prepare('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,created_at) VALUES (?,?,?,?,?,?,?)').bind(uploadId,owner,'uploads/adapter/photo','image/webp',image.length,'fixture.webp',Date.now()).run();
 await request('/api/admin/users/'+owner+'/credits',{method:'POST',cookie,data:{amount:5000,reason:'Provider fixture',currentPassword:password,idempotencyKey:randomUUID()}});
 const balance=async()=>(await request('/api/credits',{cookie})).body;
 const start=(expected=201)=>request('/api/generations',{method:'POST',cookie,data:{templateId:template.id,expectedCost:template.creditCost,uploadIds:[uploadId],idempotencyKey:randomUUID(),consent:true},expected});
 await start(409);ok('Live mode refuses templates that use the mock provider',(await balance()).available===5000);
 const first={...template.workflow[0],id:'step_image',type:'image',provider:'fal',model:'fal-ai/fixture',output:'prepared_image',settings:{outputKind:'image'}};
 const second={...first,id:'step_video',type:'video',output:'final_video',inputs:{image_url:'{{prepared_image}}'},settings:{outputKind:'video'}};
 await request('/api/admin/templates/'+template.id,{method:'PATCH',cookie,data:{...template,workflow:[first,second]}});
 const order=(await start()).body;ok('A live generation reserves its credits',(await balance()).held===template.creditCost);
 const result=await finish(cookie,order.generationId);ok('Fal adapter completes an image-to-video workflow through the HTTP boundary',result.status==='completed');
 ok('Credits are charged when the provider delivers',JSON.stringify(await balance())===JSON.stringify({available:5000-template.creditCost,held:0}));
 const assets=(await db.prepare('SELECT * FROM generated_assets WHERE generation_id=? ORDER BY created_at').bind(order.generationId).all()).results;
 ok('Provider image MIME is detected from bytes instead of assumed PNG',assets[0].mime==='image/webp'&&assets[0].size===image.length);
 ok('Known-length provider video streams into private R2',assets[1].mime==='video/mp4'&&assets[1].size===video.length&&(await bucket.get(assets[1].storage_key)).size===video.length);
 ok('Workflow passes a signed intermediate asset to the next provider step',inputs[1].image_url.includes('/api/media/asset_')&&inputs[1].image_url.includes('signature='));
 const context=JSON.parse((await db.prepare('SELECT context FROM generations WHERE id=?').bind(order.generationId).first()).context);ok('Workflow context persists stable asset IDs rather than expiring URLs',context.previous_output.startsWith('asset_')&&!JSON.stringify(context).includes('signature='));
 const rep={...second,id:'rep_video',provider:'replicate',model:'studio/fixture',inputs:{image:'{{user_image_1}}'}};
 await request('/api/admin/templates/'+template.id,{method:'PATCH',cookie,data:{...template,workflow:[rep]}});const repOrder=(await start()).body;ok('Replicate adapter completes an asynchronous video prediction',(await finish(cookie,repOrder.generationId)).status==='completed');
 await request('/api/admin/templates/'+template.id,{method:'PATCH',cookie,data:{...template,workflow:[{...second,id:'unsafe_video',inputs:{image:'{{user_image_1}}'},settings:{unsafe:true}}]}});const before=(await balance()).available;const unsafe=(await start()).body;ok('Unsafe provider output fails without fetching the private host',(await finish(cookie,unsafe.generationId)).status==='failed'&&!requests.some(r=>r.host==='127.0.0.1'));ok('The failed provider job returns its credits',(await balance()).available===before);
 await mkdir('test-results',{recursive:true});await writeFile('test-results/providers.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,network:'All Fal, Replicate and media HTTP responses are local fixtures; no paid inference performed',checks},null,2));console.log('\n'+checks.length+' provider contract checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/providers.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,error:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
