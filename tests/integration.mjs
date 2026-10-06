import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare}=require('miniflare');
const server=path.resolve('dist/server');
const moduleFiles=(await readdir(server,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const adminPassword=randomBytes(20).toString('hex');const salt=randomBytes(32).toString('hex');
const config={DEMO_MODE:'true',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),QUEUE_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(adminPassword,salt,100000,32,'sha256').toString('hex'),STRIPE_WEBHOOK_SECRET:'whsec_disposable_fixture'};
const options={modules:moduleFiles.map(f=>({type:'ESModule',path:path.join(server,f)})),modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:config,d1Databases:{DB:'studio-integration'},r2Buckets:['BUCKET'],cf:false};
const mf=new Miniflare(options);const checks=[];
function ok(name,value){assert(value,name);checks.push({name,passed:true});console.log('PASS',name)}
async function request(route,{method='GET',data,cookie,headers={},expected=200}={}){const h={origin:config.APP_ORIGIN,...(cookie?{cookie}:{}),...(data&&!(data instanceof FormData)?{'content-type':'application/json'}:{}),...headers};let payload=data!==undefined?JSON.stringify(data):undefined;if(data instanceof FormData){const encoded=new Request(config.APP_ORIGIN+route,{method:'POST',body:data});h['content-type']=encoded.headers.get('content-type');payload=await encoded.arrayBuffer();}const response=await mf.dispatchFetch(config.APP_ORIGIN+route,{method,headers:h,body:payload});const text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}if(expected!==null)assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,350)}`);return {response,body,text,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function upload(cookie,name='photo.webp',bytes){const form=new FormData();form.append('file',new File([bytes||await readFile('public/media/formula-driver.webp')],name,{type:name.endsWith('.txt')?'text/plain':'image/webp'}));return request('/api/uploads',{method:'POST',data:form,cookie,expected:name.endsWith('.txt')?415:201})}
async function generate(cookie,template,uploadIds,{cost=template.creditCost,key=randomUUID(),expected=201}={}){const payload={templateId:template.id,uploadIds,idempotencyKey:key,expectedCost:cost,consent:true};const r=await request('/api/generations',{method:'POST',cookie,data:payload,expected});return {...r,payload};}
const balance=async cookie=>(await request('/api/credits',{cookie})).body;
async function waitDone(cookie,id){const until=Date.now()+26000;const statuses=[];while(Date.now()<until){await request('/api/queue/tick',{method:'POST',cookie,data:{},expected:null});const r=await request('/api/generations/'+id,{cookie});const g=r.body.generations[0];statuses.push(g.status);if(['completed','failed'].includes(g.status))return {g,statuses};await new Promise(r=>setTimeout(r,1100));}throw new Error('Generation did not finish within 26s');}
try{
 const db=await mf.getD1Database('DB');const bucket=await mf.getR2Bucket('BUCKET');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){for(const s of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();}
 const list=await request('/api/templates');const templates=list.body.templates;const formula=templates.find(t=>t.slug==='formula-driver');ok('18 seeded templates with credit costs',templates.length===18&&formula.creditCost===299&&new Set(templates.map(t=>t.creditCost)).size>=5);
 ok('Public API hides prompts, providers, and costs',!list.text.includes('hiddenPrompt')&&!list.text.includes('estimatedCost')&&!list.text.includes('provider')&&!list.text.includes('workflow'));
 for(const route of ['/','/explore','/template/formula-driver','/template/wedding-cinematic','/privacy','/terms','/login','/register','/creations','/favorites','/credits','/account','/admin']){const r=await request(route);ok('Route loads: '+route,typeof r.body==='string'&&r.body.includes('PROJECT'));}
 await request('/template/does-not-exist',{expected:404});await request('/missing-route',{expected:404});ok('Missing templates and routes return 404',true);
 await request('/api/admin/templates',{expected:401});ok('Admin API rejects anonymous access',true);
 const reg=await request('/api/auth/register',{method:'POST',data:{name:'Disposable QA User',email:'qa@studio.test',password:'Test-password-123'},expected:201});const userCookie=reg.cookie;ok('Registration creates a secure session',!!userCookie&&reg.response.headers.get('set-cookie').includes('HttpOnly')&&reg.response.headers.get('set-cookie').includes('SameSite=Lax'));
await request('/api/admin/templates',{cookie:userCookie,expected:403});ok('Regular user cannot access admin API',true);
 await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Incorrect-123'},expected:401});ok('Wrong password is rejected',true);
 const login=await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Test-password-123'}});ok('Email login works',!!login.cookie);
 const second=await request('/api/auth/register',{method:'POST',data:{name:'Other User',email:'other@studio.test',password:'Other-password-123'},expected:201});
 const adm=await request('/api/auth/login',{method:'POST',data:{email:'admin@studio.test',password:adminPassword}});const adminCookie=adm.cookie;ok('Administrator login succeeds',adm.body.user.role==='admin');
 const grant=(userId,amount)=>request(`/api/admin/users/${userId}/credits`,{method:'POST',cookie:adminCookie,data:{amount,reason:'QA credits',currentPassword:adminPassword,idempotencyKey:randomUUID()}});
 const noCredit=new FormData();noCredit.append('file',new File([await readFile('public/media/formula-driver.webp')],'photo.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:noCredit,expected:402});ok('Uploading requires credits',true);
 await grant(reg.body.user.id,2000);await grant(second.body.user.id,100);ok('Admin grants credits',(await balance(userCookie)).available===2000);
 await upload(userCookie,'fake.txt',new Uint8Array(40));ok('Unsupported file format rejected',true);
 const fake=new FormData();fake.append('file',new File([new Uint8Array(64)],'fake.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:fake,expected:415});ok('Forged image MIME rejected',true);
 const huge=new FormData();huge.append('file',new File([new Uint8Array(8*1024*1024+1)],'large.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:huge,expected:413});ok('Oversized upload rejected',true);
 const u=await upload(userCookie);ok('Valid upload is stored',u.body.id&&u.body.url.startsWith('/api/media/'));
 const media=await mf.dispatchFetch(config.APP_ORIGIN+u.body.url,{headers:{cookie:userCookie}});ok('Owner can view uploaded image',media.status===200&&media.headers.get('content-type')==='image/webp');await media.arrayBuffer();
 await request(u.body.url,{cookie:second.cookie,expected:403});await request(u.body.url,{expected:403});ok('Other users and anonymous visitors cannot read uploads',true);
 await request('/api/favorites',{method:'POST',cookie:userCookie,data:{templateId:formula.id}});const f=await request('/api/favorites',{cookie:userCookie});ok('Favorite persists server-side',f.body.ids.includes(formula.id));await request('/api/favorites',{method:'POST',cookie:userCookie,data:{templateId:formula.id}});ok('Favorite can be removed',(await request('/api/favorites',{cookie:userCookie})).body.ids.length===0);
 await generate(second.cookie,formula,[u.body.id],{expected:403});ok('Generation rejects someone else’s image',true);
 await generate(userCookie,formula,[u.body.id],{cost:1,expected:409});ok('Client cannot tamper with the credit cost',(await balance(userCookie)).available===2000);
 const poor=await upload(second.cookie);const short=await generate(second.cookie,formula,[poor.body.id],{expected:402});
 ok('Generation needs enough credits and says how many',short.body.error.includes('299')&&(await balance(second.cookie)).available===100);
 const co=await generate(userCookie,formula,[u.body.id]);const generationId=co.body.generationId;
 ok('Starting a generation reserves its credits',co.body.balance.available===1701&&co.body.balance.held===299);
 const duplicate=await generate(userCookie,formula,[u.body.id],{key:co.payload.idempotencyKey});
 ok('Repeating a generation request returns the same creation without charging again',duplicate.body.generationId===generationId&&(await balance(userCookie)).available===1701);
 await generate(userCookie,{...formula,id:(templates.find(t=>t.slug==='astronaut')).id},[u.body.id],{cost:299,key:co.payload.idempotencyKey,expected:409});ok('A request key cannot be reused for another template',true);
 const running=(await request('/api/generations/'+generationId,{cookie:userCookie})).body.generations[0];ok('A new creation is in progress with its credits reserved',['queued','preparing','generating','finalizing'].includes(running.status)&&running.creditStatus==='pending'&&running.creditCost===299);
 const busy=await request('/api/generations?status=completed',{cookie:userCookie});ok('Active creations are counted regardless of the status filter',busy.body.activeCount===1&&busy.body.generations.every(g=>g.status==='completed'));
 const result=await waitDone(userCookie,generationId);ok('Mock workflow completes asynchronously',result.g.status==='completed'&&!!result.g.assetId);const idle=await request('/api/generations',{cookie:userCookie});ok('No active creations remain after completion, so polling can stop',idle.body.activeCount===0);
 ok('Delivery charges the reserved credits',result.g.creditStatus==='captured'&&JSON.stringify(await balance(userCookie))===JSON.stringify({available:1701,held:0}));
 const spent=(await request('/api/credits/history',{cookie:userCookie})).body.transactions.map(t=>t.kind);ok('Credit history shows the reservation and the charge',spent[0]==='capture'&&spent[1]==='hold');
 const outputs=await db.prepare('SELECT * FROM generated_assets WHERE generation_id=?').bind(generationId).all();ok('A repeated request created one output only',outputs.results.length===1);
 const video=await mf.dispatchFetch(config.APP_ORIGIN+'/api/media/'+result.g.assetId+'?download=1',{headers:{cookie:userCookie}});const bytes=new Uint8Array(await video.arrayBuffer());ok('Download returns a real MP4 attachment',video.status===200&&video.headers.get('content-disposition').includes('attachment')&&new TextDecoder().decode(bytes.slice(4,8))==='ftyp');await mkdir('test-results',{recursive:true});await writeFile('test-results/download.mp4',bytes);
 const ranged=await mf.dispatchFetch(config.APP_ORIGIN+'/api/media/'+result.g.assetId,{headers:{cookie:userCookie,range:'bytes=0-99'}});ok('Video byte ranges are supported',ranged.status===206&&(await ranged.arrayBuffer()).byteLength===100);
 await request('/api/media/'+result.g.assetId,{cookie:second.cookie,expected:403});ok('Completed videos stay private',true);
 const share=await request('/api/generations/'+generationId+'/share',{method:'POST',cookie:userCookie,data:{}});const shared=await mf.dispatchFetch(share.body.url);ok('Signed share link works without account login',shared.status===200);await shared.arrayBuffer();const broken=new URL(share.body.url);broken.searchParams.set('signature','bad');await request(broken.pathname+broken.search,{expected:403});ok('Tampered share link is rejected',true);
 const privateTemplate=(await request('/api/admin/templates/'+formula.id,{cookie:adminCookie})).body.template;ok('Admin can read hidden workflow',privateTemplate.workflow.length===1&&privateTemplate.hiddenPrompt.length>0);
 const clone={...privateTemplate,id:undefined,name:'QA Studio Test',slug:'qa-studio-test',active:false,creditCost:449,estimatedCost:125,createdAt:undefined};const created=await request('/api/admin/templates',{method:'POST',cookie:adminCookie,data:clone,expected:201});let testTemplate=created.body.template;ok('Admin creates a template draft',!!testTemplate.id&&!testTemplate.active);
 ok('Draft is hidden from catalog',!(await request('/api/templates')).body.templates.some(t=>t.id===testTemplate.id));
 testTemplate={...testTemplate,active:true};await request('/api/admin/templates/'+testTemplate.id,{method:'PATCH',cookie:adminCookie,data:testTemplate});const publicNew=(await request('/api/templates')).body.templates.find(t=>t.id===testTemplate.id);ok('Published template appears immediately with its credit cost',publicNew?.creditCost===449);
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:adminCookie,data:{...privateTemplate,creditCost:449}});ok('Admin credit cost update reaches the public catalog',(await request('/api/templates')).body.templates.find(t=>t.id===formula.id).creditCost===449);ok('A cost change does not touch existing creations',(await db.prepare('SELECT credit_cost FROM generations WHERE id=?').bind(generationId).first()).credit_cost===299);
 const another=await upload(userCookie);const early=await generate(userCookie,testTemplate,[another.body.id]);
 const imageStep={...testTemplate.workflow[0],id:randomUUID(),type:'image',output:'prepared_image'};const videoStep={...testTemplate.workflow[0],id:randomUUID(),inputs:{image:'{{previous_output}}'},output:'final_video'};
 testTemplate={...testTemplate,workflow:[imageStep,videoStep]};await request('/api/admin/templates/'+testTemplate.id,{method:'PATCH',cookie:adminCookie,data:testTemplate});ok('Admin saves ordered multi-step workflow',(await request('/api/admin/templates/'+testTemplate.id,{cookie:adminCookie})).body.template.workflow.length===2);
 const snap=await db.prepare('SELECT workflow_snapshot FROM generations WHERE id=?').bind(early.body.generationId).first();ok('An existing creation keeps the original workflow',JSON.parse(snap.workflow_snapshot).steps.length===1);await waitDone(userCookie,early.body.generationId);
 const multi=await generate(userCookie,testTemplate,[another.body.id]);const mr=await waitDone(userCookie,multi.body.generationId);ok('Image-to-video workflow completes',mr.g.status==='completed');const logs=await db.prepare('SELECT * FROM generation_steps WHERE generation_id=? ORDER BY step_order').bind(multi.body.generationId).all();ok('Workflow steps execute in order',logs.results.length===2&&logs.results.every(s=>s.status==='completed'));
 const failedTemplate={...testTemplate,workflow:[{...videoStep,inputs:{image:'{{user_image_1}}'},settings:{simulateFailure:true}}]};await request('/api/admin/templates/'+testTemplate.id,{method:'PATCH',cookie:adminCookie,data:failedTemplate});const before=(await balance(userCookie)).available;const failure=await generate(userCookie,failedTemplate,[another.body.id]);const fr=await waitDone(userCookie,failure.body.generationId);ok('Provider failure is recorded',fr.g.status==='failed');
 ok('A failed generation returns its credits',fr.g.creditStatus==='released'&&JSON.stringify(await balance(userCookie))===JSON.stringify({available:before,held:0}));
 await request('/api/admin/generations/'+failure.body.generationId+'/retry',{method:'POST',cookie:adminCookie,data:{}});
 ok('An admin retry reserves the credits again',(await balance(userCookie)).available===before-449&&(await request('/api/generations/'+failure.body.generationId,{cookie:userCookie})).body.generations[0].creditStatus==='pending');
 const retried=await waitDone(userCookie,failure.body.generationId);ok('A failed retry returns the credits again',retried.g.status==='failed'&&(await balance(userCookie)).available===before);
 await request('/api/admin/generations/'+failure.body.generationId+'/retry',{method:'POST',cookie:userCookie,data:{},expected:403});ok('Customers cannot retry through the admin API',true);
 const dashboard=(await request('/api/admin/dashboard',{cookie:adminCookie})).body;ok('Admin metrics reflect real database activity',dashboard.users===3&&dashboard.metrics.total>=4&&dashboard.metrics.failed>=1&&dashboard.credits.consumed>=299+449*2&&dashboard.credits.granted===2100);
 await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{status:'suspended'}});await request('/api/favorites',{cookie:second.cookie,expected:401});ok('Suspending a user revokes sessions',true);await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{status:'active'}});ok('Admin can reactivate users',true);
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{name:'Updated QA'}});ok('Account changes persist',(await request('/api/me',{cookie:userCookie})).body.user.name==='Updated QA');
 await request('/api/account',{method:'PATCH',cookie:userCookie,headers:{origin:'https://evil.test','sec-fetch-site':'cross-site'},data:{name:'Evil'},expected:403});ok('Cross-site mutation blocked',true);
 await request('/api/webhooks/stripe',{method:'POST',data:{id:'forged'},expected:400});ok('Unsigned Stripe webhook rejected',true);
 // Exercise real HMAC verification and replay handling for a credit pack without contacting Stripe.
 const pack=(await request('/api/admin/credit-packages',{method:'POST',cookie:adminCookie,data:{name:'QA pack',credits:300,prices:{USD:299},active:true},expected:201})).body.package;
 const purchase=(await request('/api/credits/checkout',{method:'POST',cookie:userCookie,data:{packageId:pack.id,currency:'USD',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
 const sp=await db.prepare('SELECT * FROM credit_purchases WHERE id=?').bind(purchase.purchaseId).first();const beforePack=(await balance(userCookie)).available;
 const e={id:'evt_fixture_1',type:'checkout.session.completed',data:{object:{id:sp.provider_session_id,payment_status:'paid',payment_intent:'pi_fixture',amount_total:sp.amount,currency:sp.currency.toLowerCase(),metadata:{purchase_id:sp.id}}}};const timestamp=Math.floor(Date.now()/1000);const signature=createHmac('sha256',config.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+JSON.stringify(e)).digest('hex');
 for(let i=0;i<2;i++)await request('/api/webhooks/stripe',{method:'POST',data:e,headers:{'stripe-signature':`t=${timestamp},v1=${signature}`}});ok('Signed Stripe webhook grants pack credits once and tolerates replay',(await balance(userCookie)).available===beforePack+300);ok('Webhook event persisted once',(await db.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE id='evt_fixture_1'").first()).n===1);
 // Creation/file deletion proves bytes are removed, rather than merely hidden.
 const assetKey=outputs.results[0].storage_key;await request('/api/generations/'+generationId,{method:'DELETE',cookie:userCookie});ok('Delete creation removes the video from object storage',await bucket.get(assetKey)===null);await request('/api/media/'+result.g.assetId,{cookie:userCookie,expected:404});
 const orphan=await upload(userCookie);const orphanDb=await db.prepare('SELECT storage_key FROM user_uploads WHERE id=?').bind(orphan.body.id).first();await request('/api/uploads/'+orphan.body.id,{method:'DELETE',cookie:userCookie});ok('Delete upload removes stored bytes',await bucket.get(orphanDb.storage_key)===null);
 const dup=await request('/api/admin/templates/'+testTemplate.id+'/duplicate',{method:'POST',cookie:adminCookie,data:{},expected:201});ok('Admin duplicates a template as a draft',!dup.body.template.active&&dup.body.template.id!==testTemplate.id);await request('/api/admin/templates/'+dup.body.template.id,{method:'DELETE',cookie:adminCookie});ok('Admin removes a template',!(await request('/api/admin/templates',{cookie:adminCookie})).body.templates.some(t=>t.id===dup.body.template.id));
 // Template preview media is studio-owned and kept apart from customer photos.
 const webp=await readFile('public/media/formula-driver.webp'),mp4=await readFile('public/media/formula-driver.mp4');
 const mediaForm=(name,type,bytes)=>{const form=new FormData();form.append('file',new File([bytes],name,{type}));return form};
 const adminMedia=(name,type,bytes)=>request('/api/admin/media',{method:'POST',data:mediaForm(name,type,bytes),cookie:adminCookie,expected:201});
 const keyOf=async id=>(await db.prepare('SELECT storage_key FROM template_media WHERE id=?').bind(id).first())?.storage_key;
 await request('/api/admin/media',{method:'POST',data:mediaForm('x.webp','image/webp',webp),cookie:userCookie,expected:403});ok('Customers cannot upload template media',true);
 await db.batch(Array.from({length:250},(_,i)=>db.prepare('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,created_at) VALUES (?,?,?,?,?,?,?)').bind('up_quota_'+i,adm.body.user.id,'uploads/quota/'+i,'image/webp',100,'q.webp',Date.now())));
 const ma=await adminMedia('thumb-a.webp','image/webp',webp);
 ok('Admin preview uploads are stored as studio media, not customer photos',ma.body.url==='/api/media/'+ma.body.id&&!!await keyOf(ma.body.id)&&!await db.prepare('SELECT id FROM user_uploads WHERE id=?').bind(ma.body.id).first());
 await grant(adm.body.user.id,10);
 await request('/api/uploads',{method:'POST',data:mediaForm('photo.webp','image/webp',webp),cookie:adminCookie,expected:413});ok('Admin previews ignore the customer photo quota, which still applies to photos',true);
 await db.prepare("DELETE FROM user_uploads WHERE id LIKE 'up_quota_%'").run();
 ok('Template previews are public and cacheable',(await request(ma.body.url)).response.headers.get('cache-control').includes('public'));
 const mb=await adminMedia('example-b.webp','image/webp',webp),mv=await adminMedia('preview.mp4','video/mp4',mp4),mc=await adminMedia('thumb-c.webp','image/webp',webp),md=await adminMedia('never-saved.webp','image/webp',webp),me=await adminMedia('poster.webp','image/webp',webp);
 ok('Admin uploads MP4 preview videos',mv.body.mime==='video/mp4');
 const mediaTemplate=(await request('/api/admin/templates',{method:'POST',cookie:adminCookie,data:{...clone,name:'QA Media Test',slug:'qa-media-test',thumbnail:ma.body.url,previewVideo:mv.body.url,previewImages:[mb.body.url]},expected:201})).body.template;
 const mediaCopy=(await request('/api/admin/templates/'+mediaTemplate.id+'/duplicate',{method:'POST',cookie:adminCookie,data:{},expected:201})).body.template;
 const aKey=await keyOf(ma.body.id);
 await request('/api/admin/templates/'+mediaTemplate.id,{method:'PATCH',cookie:adminCookie,data:{...mediaTemplate,thumbnail:mc.body.url}});
 ok('A replaced preview still used by a duplicate is kept',!!await keyOf(ma.body.id));
 await request('/api/admin/media/'+ma.body.id,{method:'DELETE',cookie:adminCookie,expected:409});ok('Media in use cannot be deleted from the library',true);
 const library=(await request('/api/admin/media',{cookie:adminCookie})).body;const libA=library.media.find(m=>m.id===ma.body.id);
 ok('Media library shows which templates use each file',libA.usedBy.length===1&&libA.usedBy[0].id===mediaCopy.id&&libA.removableAt===null&&library.usage.count>=6);
 await request('/api/admin/templates/'+mediaCopy.id,{method:'DELETE',cookie:adminCookie});
 ok('Deleting the last template using a preview removes the file and its bytes',!await keyOf(ma.body.id)&&!await bucket.get(aKey));
 ok('Previews still used by another template are kept',!!await keyOf(mb.body.id)&&!!await keyOf(mv.body.id)&&!!await keyOf(mc.body.id));
 await db.prepare('UPDATE generations SET thumbnail=? WHERE id=?').bind(me.body.url,generationId).run();
 await db.prepare('UPDATE template_media SET created_at=? WHERE id IN (?,?,?)').bind(Date.now()-25*3600000,mb.body.id,md.body.id,me.body.id).run();
 await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('last_maintenance','0')").run();await request('/api/queue/dispatch',{method:'POST',headers:{authorization:'Bearer '+config.QUEUE_SECRET}});
 ok('Hourly sweep removes old uploads that were never saved to a template',!await keyOf(md.body.id));
 ok('Sweep keeps media used by a template or as a past creation poster',!!await keyOf(mb.body.id)&&!!await keyOf(me.body.id));
 const mf2=await adminMedia('delete-me.webp','image/webp',webp);const fKey=await keyOf(mf2.body.id);await request('/api/admin/media/'+mf2.body.id,{method:'DELETE',cookie:adminCookie});
 ok('Unused media can be deleted from the library',!await keyOf(mf2.body.id)&&!await bucket.get(fKey));
 await request('/api/admin/templates/'+mediaTemplate.id,{method:'DELETE',cookie:adminCookie});
 // Migration 0002 moves existing previews out of customer uploads without changing their ids.
 const migration=new Miniflare({modules:true,script:'export default {fetch(){return new Response(null)}}',d1Databases:{M:'migration-check'}});
 try{const m=await migration.getD1Database('M');const files=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
  const apply=async f=>{for(const s of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await m.prepare(s).run();};
  for(const f of files.slice(0,2))await apply(f);
  await m.prepare("INSERT INTO users (id,email,name,role,status,email_verified,created_at) VALUES ('usr_m','m@studio.test','M','admin','active',1,1)").run();
  await m.prepare("INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,public,created_at) VALUES ('up_prev','usr_m','previews/usr_m/up_prev','video/mp4',10,'p.mp4',1,1),('up_photo','usr_m','uploads/usr_m/up_photo','image/webp',10,'f.webp',0,1)").run();
  for(const f of files.slice(2))await apply(f);
  const moved=await m.prepare("SELECT * FROM template_media WHERE id='up_prev'").first();const left=(await m.prepare('SELECT id FROM user_uploads').all()).results.map(r=>r.id);
  ok('Migration moves existing previews with their ids and keeps customer photos',moved?.storage_key==='previews/usr_m/up_prev'&&moved.uploaded_by==='usr_m'&&left.length===1&&left[0]==='up_photo');
 }finally{await migration.dispose();}
 const clean=await request('/api/auth/register',{method:'POST',data:{name:'Delete Test',email:'delete@studio.test',password:'Delete-password-123'},expected:201});await grant(clean.body.user.id,10);const cleanUpload=await upload(clean.cookie);await request('/api/account',{method:'DELETE',cookie:clean.cookie,data:{password:'Delete-password-123'}});ok('Account deletion removes the user and uploads',!(await db.prepare('SELECT id FROM users WHERE id=?').bind(clean.body.user.id).first())&&!(await db.prepare('SELECT id FROM user_uploads WHERE id=?').bind(cleanUpload.body.id).first()));
 await request('/api/auth/logout',{method:'POST',cookie:userCookie,data:{}});await request('/api/favorites',{cookie:userCookie,expected:401});ok('Sign-out invalidates the session',true);
 await writeFile('test-results/integration.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));console.log('\n'+checks.length+' integration checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/integration.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,error:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
