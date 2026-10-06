// Isolated production-mode acceptance and secret-storage regression tests.
// All external HTTP is intercepted. This suite makes no payments or paid AI calls.
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,randomUUID} from 'node:crypto';
import {fakePok} from './fake-pok.mjs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,Response:MFResponse}=require('miniflare');
const server=path.resolve('dist/server');
const modules=(await readdir(server,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b)).map(f=>({type:'ESModule',path:path.join(server,f)}));
const password=randomBytes(20).toString('hex'),salt=randomBytes(32).toString('hex');
const env={DEMO_MODE:'false',PUBLIC_SERVICE_ACCESS:'true',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),QUEUE_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),REPLICATE_API_TOKEN:'replicate_environment_fixture'};
const keys={POK_KEY_ID:'pokkey_'+randomBytes(10).toString('hex'),POK_KEY_SECRET:'poksecret_'+randomBytes(20).toString('hex'),POK_MERCHANT_ID:'merchant_'+randomBytes(8).toString('hex'),FAL_KEY:'fal_'+randomBytes(20).toString('hex'),RESEND_API_KEY:'re_'+randomBytes(20).toString('hex'),MAIL_FROM:'hello@studio.test'};
const image=await readFile('public/media/formula-driver.webp'),video=await readFile('public/media/formula-driver.mp4');
const requests=[],jobs=new Map();let serial=0;
const pok=fakePok({keyId:keys.POK_KEY_ID,keySecret:keys.POK_KEY_SECRET,merchantId:keys.POK_MERCHANT_ID,Response:MFResponse});
const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:env,d1Databases:{DB:'production-fixture'},r2Buckets:['BUCKET'],cf:false,outboundService:async req=>{
  const u=new URL(req.url);requests.push({host:u.hostname,path:u.pathname});
  if(u.hostname==='api.resend.com'){assert.equal(req.headers.get('authorization'),'Bearer '+keys.RESEND_API_KEY);return MFResponse.json({id:'local_mail_fixture'});}
  if(pok.matches(u)){assert.equal(u.hostname,'api-staging.pokpay.io','Staging is the default POK environment');return pok.handle(req);}
  if(u.hostname==='queue.fal.run'){
    assert.equal(req.headers.get('authorization'),'Key '+keys.FAL_KEY);
    if(req.method==='POST'){
      const id='job_'+(++serial),input=await req.json();jobs.set(id,{input,image:u.pathname.endsWith('/edit')});
      return MFResponse.json({request_id:id,status_url:'https://queue.fal.run/status/'+id,response_url:'https://queue.fal.run/result/'+id,cancel_url:'https://queue.fal.run/cancel/'+id});
    }
    if(u.pathname.startsWith('/status/'))return MFResponse.json({status:'COMPLETED'});
    const job=jobs.get(u.pathname.split('/').at(-1));assert(job);
    return MFResponse.json(job.image?{images:[{url:'https://storage.googleapis.com/falserverless/fixture.webp'}]}:{video:{url:'https://v3.fal.media/fixture.mp4'}});
  }
  if(u.hostname==='storage.googleapis.com'||u.hostname==='v3.fal.media'){
    const bytes=u.pathname.endsWith('.webp')?image:video;
    return new MFResponse(bytes,{headers:{'Content-Length':String(bytes.length)}});
  }
  throw new Error('Unexpected external request');
}});
const checks=[];
const ok=(name,value=true)=>{assert(value,name);checks.push({name,passed:true});console.log('PASS',name)};
async function request(route,{method='GET',data,cookie,expected=200,origin=env.APP_ORIGIN}={}){
  const r=await mf.dispatchFetch(env.APP_ORIGIN+route,{method,headers:{origin,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
  if(expected!==null)assert.equal(r.status,expected,route+': '+text.slice(0,180));return {body,text,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const admin=(await request('/api/auth/login',{method:'POST',data:{email:env.ADMIN_EMAIL,password}})).cookie;
  ok('Production administrator login works without external services',!!admin);
  await request('/api/admin/connections',{expected:401});ok('Anonymous access to connections is rejected');
  await request('/api/auth/register',{method:'POST',data:{name:'Member',email:'member@studio.test',password:'Member-password-123'},expected:503});
  ok('Registration is explicitly closed until email is configured',!(await db.prepare("SELECT id FROM users WHERE email='member@studio.test'").first()));
  const template=(await request('/api/admin/templates/tpl_formula-driver',{cookie:admin})).body.template;
  ok('Production seed uses actual image and video endpoints',template.workflow.length===2&&template.workflow.every(s=>s.provider==='fal')&&template.workflow[1].model==='fal-ai/kling-video/v2.6/pro/image-to-video');
  const page=await request('/template/formula-driver');
  ok('Closed creation is visible before an upload',page.text.includes('Creation is currently closed.')&&!page.text.includes('Demo studio'));
  const save=(values,extra={})=>request('/api/admin/connections',{method:'PATCH',cookie:admin,data:{currentPassword:password,values,...extra}});
  await request('/api/admin/connections',{method:'PATCH',cookie:admin,origin:'https://attacker.test',data:{currentPassword:password,values:keys},expected:403});ok('Connection changes reject a cross-site origin');
  await request('/api/admin/connections',{method:'PATCH',cookie:admin,data:{currentPassword:'incorrect-password',values:keys},expected:403});ok('Saving keys requires administrator password reauthentication');
  await request('/api/admin/connections',{method:'PATCH',cookie:admin,data:{currentPassword:password,values:{POK_ENVIRONMENT:'live'}},expected:400});ok('The POK environment accepts only staging or production');
  await save(keys);
  const stored=(await db.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'connection.%'").all()).results;
  ok('Stored connections do not contain plaintext secrets',stored.length===6&&Object.values(keys).every(secret=>!JSON.stringify(stored).includes(secret)));
  let status=await request('/api/admin/connections',{cookie:admin});
  ok('Status returns presence, not keys or ciphertext',status.body.fields.FAL_KEY.configured&&Object.values(keys).filter(k=>k!==keys.MAIL_FROM&&k!==keys.POK_MERCHANT_ID).every(k=>!status.text.includes(k))&&!status.text.includes('"iv"'));
  ok('POK staging is reported as test payments',status.body.readiness.paymentMode==='test'&&status.body.fields.POK_ENVIRONMENT.value==='staging');
  await request('/api/admin/connections',{method:'PATCH',cookie:admin,data:{currentPassword:password,values:{REPLICATE_API_TOKEN:'replacement_token_not_allowed'}},expected:409});ok('Environment-managed keys cannot be overwritten from the dashboard');
  const original=stored.find(r=>r.key==='connection.FAL_KEY').value;
  await save({FAL_KEY:keys.FAL_KEY});
  ok('Repeated saves use fresh authenticated-encryption nonces',(await db.prepare("SELECT value FROM app_settings WHERE key='connection.FAL_KEY'").first()).value!==original);
  const member=(await request('/api/auth/register',{method:'POST',data:{name:'Member',email:'member@studio.test',password:'Member-password-123'},expected:201}));
  ok('Configured production registration requires email verification',member.body.verificationRequired&&!member.body.user.emailVerified&&requests.some(r=>r.host==='api.resend.com'));
  await request('/api/admin/connections',{cookie:member.cookie,expected:403});ok('Members cannot inspect connection configuration');
  await request('/api/admin/connections',{method:'PATCH',cookie:member.cookie,data:{currentPassword:password,values:{FAL_KEY:keys.FAL_KEY}},expected:403});ok('Members cannot write connections even with a supplied password');
  const preset=(await request('/api/admin/workflows/preset',{method:'POST',cookie:admin,data:{...template,requiredImageCount:2}})).body;
  ok('Preset maps two reference photos and chains its generated image',preset.workflow[0].settings.image_urls.length===2&&preset.workflow[1].inputs.start_image_url==='{{prepared_image}}'&&preset.workflow[0].prompt==='');
  const owner=(await request('/api/me',{cookie:admin})).body.user.id;
  await bucket.put('uploads/fixture',image);
  await db.prepare('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,created_at) VALUES (?,?,?,?,?,?,?)').bind('up_fixture',owner,'uploads/fixture','image/webp',image.length,'photo.webp',Date.now()).run();
  const creation={templateId:template.id,expectedCost:template.creditCost,uploadIds:['up_fixture'],idempotencyKey:randomUUID(),consent:true};
  await request('/api/generations',{method:'POST',cookie:admin,data:creation,expected:503});
  const pack=(await request('/api/admin/credit-packages',{method:'POST',cookie:admin,data:{name:'Launch pack',credits:1000,prices:{EUR:999},active:true},expected:201})).body.package;
  await request('/api/credits/checkout',{method:'POST',cookie:admin,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:503});
  ok('Missing service readiness blocks generation and credit sales before anything is charged',(await db.prepare('SELECT COUNT(*) AS n FROM credit_holds').first()).n===0&&(await db.prepare('SELECT COUNT(*) AS n FROM credit_purchases').first()).n===0&&!requests.some(r=>pok.matches(new URL('https://'+r.host))));
  await request('/api/admin/providers/fal',{method:'PATCH',cookie:admin,data:{enabled:true}});
  await mf.dispatchFetch(env.APP_ORIGIN+'/api/queue/dispatch',{method:'POST',headers:{authorization:'Bearer '+env.QUEUE_SECRET}});
  ok('Enabled provider and external dispatcher complete configuration',(await request('/api/admin/connections',{cookie:admin})).body.readiness.ready);
  const mailCipher=(await db.prepare("SELECT value FROM app_settings WHERE key='connection.RESEND_API_KEY'").first()).value;
  await db.prepare("UPDATE app_settings SET value=? WHERE key='connection.FAL_KEY'").bind(mailCipher).run();
  status=await request('/api/admin/connections',{cookie:admin});
  ok('Ciphertext cannot be transplanted to another credential field',!status.body.fields.FAL_KEY.configured&&!status.body.readiness.ready);
  await save({FAL_KEY:keys.FAL_KEY});ok('An administrator can repair an unreadable saved connection',(await request('/api/admin/connections',{cookie:admin})).body.fields.FAL_KEY.configured);
  const bought=(await request('/api/credits/checkout',{method:'POST',cookie:admin,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
  const pokOrder=pok.last();
  ok('Production credit sales open a POK order',bought.url===pokOrder.self.confirmUrl&&pokOrder.merchantCustomReference===bought.purchaseId);
  await request('/api/credits/purchases/'+bought.purchaseId+'/pay',{method:'POST',cookie:admin,data:{result:'success'},expected:403});ok('Simulated payment cannot confirm a production purchase');
  pok.pay(pokOrder.id);await request('/api/credits/purchases/'+bought.purchaseId+'/verify',{method:'POST',cookie:admin,data:{}});
  ok('A payment confirmed by POK grants the pack credits',(await request('/api/credits',{cookie:admin})).body.available===1000);
  const order=(await request('/api/generations',{method:'POST',cookie:admin,data:creation,expected:201})).body;
  let generation;
  const until=Date.now()+30000;
  while(Date.now()<until){await request('/api/queue/tick',{method:'POST',cookie:admin,data:{},expected:null});generation=(await request('/api/generations/'+order.generationId,{cookie:admin})).body.generations[0];if(['completed','failed'].includes(generation.status))break;await new Promise(r=>setTimeout(r,700));}
  ok('Encrypted connections power a paid credit pack and the actual preset adapters',generation.status==='completed');
  ok('The delivered video spends the template credits',(await request('/api/credits',{cookie:admin})).body.available===1000-template.creditCost);
  const submitted=[...jobs.values()];
  ok('Hidden prompt and signed photos are supplied only to the provider',submitted[0].input.prompt===template.hiddenPrompt&&submitted[0].input.image_urls[0].includes('signature=')&&submitted[1].input.start_image_url.includes('/api/media/asset_'));
  const catalog=await request('/api/templates/formula-driver');
  ok('Public template payload excludes private prompt, workflow, cost and keys',!catalog.text.includes(template.hiddenPrompt)&&!catalog.text.includes('workflow')&&!catalog.text.includes('estimatedCost')&&Object.values(keys).every(k=>!catalog.text.includes(k)));
  const download=await mf.dispatchFetch(env.APP_ORIGIN+'/api/media/'+generation.assetId+'?download=1',{headers:{cookie:admin}});
  ok('Provider result is downloadable from private storage',download.status===200&&download.headers.get('content-disposition').includes('attachment')&&(await download.arrayBuffer()).byteLength===video.length);
  const stale=(await request('/api/credits/checkout',{method:'POST',cookie:admin,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
  await db.prepare("UPDATE credit_purchases SET provider='mock',status='pending' WHERE id=?").bind(stale.purchaseId).run();
  await request('/api/credits/purchases/'+stale.purchaseId+'/retry',{method:'POST',cookie:admin,data:{},expected:403});ok('A test purchase cannot reopen checkout after a production switch');
  await db.prepare("UPDATE app_settings SET value='1' WHERE key='queue_dispatch_heartbeat'").run();
  ok('A stale dispatcher closes new credit sales',(await request('/api/admin/connections',{cookie:admin})).body.readiness.ready===false);
  await request('/api/generations',{method:'POST',cookie:admin,data:{...creation,idempotencyKey:randomUUID()},expected:503});ok('A stale dispatcher also closes new generations');
  await save({}, {remove:['FAL_KEY']});
  ok('Removing a connection actually deletes its encrypted record',!(await db.prepare("SELECT key FROM app_settings WHERE key='connection.FAL_KEY'").first()));
  const audit=(await db.prepare('SELECT * FROM audit_logs').all()).results;
  ok('Audit records contain no passwords or provider keys',![password,...Object.values(keys)].some(k=>JSON.stringify(audit).includes(k)));
  await mkdir('test-results',{recursive:true});await writeFile('test-results/production.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,network:'All external responses use local fixtures. No actual live payments or AI generations were made.',checks},null,2));
  console.log('\n'+checks.length+' production configuration checks passed.');
}catch(e){console.error('FAIL',e);process.exitCode=1}finally{await mf.dispose()}
