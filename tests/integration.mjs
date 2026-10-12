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
const config={DEMO_MODE:'true',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),QUEUE_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(adminPassword,salt,100000,32,'sha256').toString('hex')};
const options={modules:moduleFiles.map(f=>({type:'ESModule',path:path.join(server,f)})),modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:config,d1Databases:{DB:'studio-integration'},r2Buckets:['BUCKET'],cf:false};
const mf=new Miniflare(options);const checks=[];
function ok(name,value){assert(value,name);checks.push({name,passed:true});console.log('PASS',name)}
async function request(route,{method='GET',data,cookie,lang,headers={},expected=200}={}){const h={origin:config.APP_ORIGIN,cookie:[cookie,lang===undefined?'studio_lang=en':lang&&'studio_lang='+lang].filter(Boolean).join('; '),...(data&&!(data instanceof FormData)?{'content-type':'application/json'}:{}),...headers};let payload=data!==undefined?JSON.stringify(data):undefined;if(data instanceof FormData){const encoded=new Request(config.APP_ORIGIN+route,{method:'POST',body:data});h['content-type']=encoded.headers.get('content-type');payload=await encoded.arrayBuffer();}const response=await mf.dispatchFetch(config.APP_ORIGIN+route,{method,headers:h,body:payload});const text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}if(expected!==null)assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,350)}`);return {response,body,text,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function upload(cookie,name='photo.webp',bytes){const form=new FormData();form.append('file',new File([bytes||await readFile('public/media/formula-driver.webp')],name,{type:name.endsWith('.txt')?'text/plain':'image/webp'}));return request('/api/uploads',{method:'POST',data:form,cookie,expected:name.endsWith('.txt')?415:201})}
async function generate(cookie,template,uploadIds,{cost=template.creditCost,key=randomUUID(),expected=201}={}){const payload={templateId:template.id,uploadIds,idempotencyKey:key,expectedCost:cost,consent:true};const r=await request('/api/generations',{method:'POST',cookie,data:payload,expected});return {...r,payload};}
const balance=async cookie=>(await request('/api/credits',{cookie})).body;
async function waitDone(cookie,id){const until=Date.now()+26000;const statuses=[];while(Date.now()<until){await request('/api/queue/tick',{method:'POST',cookie,data:{},expected:null});const r=await request('/api/generations/'+id,{cookie});const g=r.body.generations[0];statuses.push(g.status);if(['completed','failed','refused'].includes(g.status))return {g,statuses};await new Promise(r=>setTimeout(r,1100));}throw new Error('Generation did not finish within 26s');}
try{
 const db=await mf.getD1Database('DB');const bucket=await mf.getR2Bucket('BUCKET');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){for(const s of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();}
 const list=await request('/api/templates');const templates=list.body.templates;const formula=templates.find(t=>t.slug==='formula-driver');ok('18 seeded templates with credit costs',templates.length===18&&formula.creditCost===299&&new Set(templates.map(t=>t.creditCost)).size>=5);
 ok('Public API hides prompts, providers, and costs',!list.text.includes('hiddenPrompt')&&!list.text.includes('estimatedCost')&&!list.text.includes('provider')&&!list.text.includes('workflow'));
 for(const route of ['/','/explore','/template/formula-driver','/template/wedding-cinematic','/privacy','/terms','/faq','/contact','/login','/register','/creations','/favorites','/credits','/pricing','/account','/admin']){const r=await request(route);ok('Route loads: '+route,typeof r.body==='string'&&r.body.includes('PROJECT'));}
 // C9: the storefront is paged on the server; pages don't overlap and filters apply before paging.
 const p1=(await request('/api/templates?limit=5&page=1')).body,p4=(await request('/api/templates?limit=5&page=4')).body;ok('Catalog pages: 5 per page, 4 pages, last page holds the rest',p1.templates.length===5&&p1.pagination.pages===4&&p1.pagination.total===18&&p4.templates.length===3&&!p4.templates.some(t=>p1.templates.some(x=>x.id===t.id)));
 const cat=formula.category;const byText=(await request('/api/templates?q='+encodeURIComponent(cat.toLowerCase()))).body;ok('Catalog search matches the category name too',byText.templates.length>0&&byText.templates.some(t=>t.category===cat));
 const filtered=(await request('/explore?q=formula')).text;ok('Explore renders the filtered first page on the server',filtered.includes('/template/formula-driver')&&!filtered.includes('/template/astronaut'));
 await request('/template/does-not-exist',{expected:404});await request('/missing-route',{expected:404});ok('Missing templates and routes return 404',true);
 await request('/api/admin/templates',{expected:401});ok('Admin API rejects anonymous access',true);
 const reg=await request('/api/auth/register',{method:'POST',data:{name:'Disposable QA User',email:'qa@studio.test',password:'Test-password-123',acceptTerms:true,confirmAge:true},expected:201});const userCookie=reg.cookie;
 const consentRow=await db.prepare('SELECT terms_version,terms_accepted_at,age_confirmed_at,marketing_opt_in,marketing_opt_in_at FROM users WHERE id=?').bind(reg.body.user.id).first();
 ok('Sign-up records Terms acceptance, age confirmation and no marketing consent by default',!!consentRow.terms_version&&consentRow.terms_accepted_at>0&&consentRow.age_confirmed_at>0&&consentRow.marketing_opt_in===0&&consentRow.marketing_opt_in_at===null);
 const noTerms=await request('/api/auth/register',{method:'POST',data:{name:'No Consent',email:'noterms@studio.test',password:'Test-password-123',confirmAge:true},expected:400});
 ok('Sign-up is rejected without accepting the Terms',noTerms.body?.error&&!(await db.prepare("SELECT id FROM users WHERE email='noterms@studio.test'").first()));
 const noAge=await request('/api/auth/register',{method:'POST',data:{name:'No Age',email:'noage@studio.test',password:'Test-password-123',acceptTerms:true},expected:400});
 ok('Sign-up is rejected without confirming the minimum age',noAge.body?.error&&!(await db.prepare("SELECT id FROM users WHERE email='noage@studio.test'").first()));
 const optIn=await request('/api/auth/register',{method:'POST',data:{name:'Opt In',email:'optin@studio.test',password:'Test-password-123',acceptTerms:true,confirmAge:true,marketingOptIn:true},expected:201});
 const optRow=await db.prepare('SELECT marketing_opt_in,marketing_opt_in_at FROM users WHERE id=?').bind(optIn.body.user.id).first();
 ok('Marketing opt-in is recorded with its timestamp when chosen',optRow.marketing_opt_in===1&&optRow.marketing_opt_in_at>0);
 await db.prepare('DELETE FROM users WHERE id=?').bind(optIn.body.user.id).run();// keep later user-count assertions unaffected
 ok('Registration creates a secure session',!!userCookie&&reg.response.headers.get('set-cookie').includes('HttpOnly')&&reg.response.headers.get('set-cookie').includes('SameSite=Lax'));
await request('/api/admin/templates',{cookie:userCookie,expected:403});ok('Regular user cannot access admin API',true);
 await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Incorrect-123'},expected:401});ok('Wrong password is rejected',true);
 const login=await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Test-password-123'}});ok('Email login works',!!login.cookie);
 const second=await request('/api/auth/register',{method:'POST',data:{name:'Other User',email:'other@studio.test',password:'Other-password-123',acceptTerms:true,confirmAge:true},expected:201});
 const adm=await request('/api/auth/login',{method:'POST',data:{email:'admin@studio.test',password:adminPassword}});const adminCookie=adm.cookie;ok('Administrator login succeeds',adm.body.user.role==='admin');
 const grant=(userId,amount)=>request(`/api/admin/users/${userId}/credits`,{method:'POST',cookie:adminCookie,data:{amount,reason:'QA credits',currentPassword:adminPassword,idempotencyKey:randomUUID()}});
 const noCredit=new FormData();noCredit.append('file',new File([await readFile('public/media/formula-driver.webp')],'photo.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:noCredit,expected:402});ok('Uploading requires credits',true);
 await grant(reg.body.user.id,2000);await grant(second.body.user.id,100);ok('Admin grants credits',(await balance(userCookie)).available===2000);
 await upload(userCookie,'fake.txt',new Uint8Array(40));ok('Unsupported file format rejected',true);
 const fake=new FormData();fake.append('file',new File([new Uint8Array(64)],'fake.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:fake,expected:415});ok('Forged image MIME rejected',true);
 const huge=new FormData();huge.append('file',new File([new Uint8Array(8*1024*1024+1)],'large.webp',{type:'image/webp'}));await request('/api/uploads',{method:'POST',cookie:userCookie,data:huge,expected:413});ok('Oversized upload rejected',true);
 // Uploaded photos are stored cleaned: no metadata (GPS), nothing hidden after the image, and at least 512 × 512.
 const sendPhoto=async(name,type,bytes,expected=201)=>{const f=new FormData();f.append('file',new File([bytes],name,{type}));return request('/api/uploads',{method:'POST',cookie:userCookie,data:f,expected});};
 const stored=async id=>new Uint8Array(await (await bucket.get((await db.prepare('SELECT storage_key FROM user_uploads WHERE id=?').bind(id).first()).storage_key)).arrayBuffer());
 const has=(bytes,text)=>Buffer.from(bytes).includes(Buffer.from(text));
 const jpeg=await readFile('tests/fixtures/photo-600.jpg'),exif=Buffer.from('Exif\0\0GPSInfo 41.3275N 19.8187E'),app1=Buffer.concat([Buffer.from([0xff,0xe1,(exif.length+2)>>8,(exif.length+2)&255]),exif]);
 const dirtyJpeg=Buffer.concat([jpeg.subarray(0,2),app1,jpeg.subarray(2),Buffer.from('HIDDEN-PAYLOAD')]);
 const cj=await stored((await sendPhoto('photo.jpg','image/jpeg',dirtyJpeg)).body.id);
 ok('JPEG uploads lose GPS metadata and hidden trailing data',!has(cj,'GPSInfo')&&!has(cj,'HIDDEN-PAYLOAD')&&cj[0]===0xff&&cj[1]===0xd8&&cj.at(-2)===0xff&&cj.at(-1)===0xd9&&cj.length<dirtyJpeg.length);
 const png=await readFile('tests/fixtures/photo-600.png'),text=Buffer.from('Location\0Tirana'),textChunk=Buffer.concat([Buffer.from([0,0,0,text.length]),Buffer.from('tEXt'),text,Buffer.alloc(4)]);
 const cp=await stored((await sendPhoto('photo.png','image/png',Buffer.concat([png.subarray(0,33),textChunk,png.subarray(33),Buffer.from('HIDDEN-PAYLOAD')]))).body.id);
 ok('PNG uploads lose text metadata and hidden trailing data',!has(cp,'Tirana')&&!has(cp,'HIDDEN-PAYLOAD')&&Buffer.from(cp.subarray(-8,-4)).toString()==='IEND');
 const webpPhoto=await readFile('public/media/formula-driver.webp'),exifChunk=Buffer.concat([Buffer.from('EXIF'),Buffer.from([8,0,0,0]),Buffer.from('GPS-WEBP')]),body=Buffer.concat([webpPhoto.subarray(12),exifChunk]);
 const riff=Buffer.alloc(12);webpPhoto.copy(riff,0,0,12);riff.writeUInt32LE(4+body.length,4);
 const cw=await stored((await sendPhoto('photo.webp','image/webp',Buffer.concat([riff,body,Buffer.from('HIDDEN-PAYLOAD')]))).body.id);
 ok('WebP uploads lose EXIF chunks and hidden trailing data',!has(cw,'GPS-WEBP')&&!has(cw,'HIDDEN-PAYLOAD')&&Buffer.from(cw).readUInt32LE(4)===cw.length-8);
 const small=await sendPhoto('small.jpg','image/jpeg',await readFile('tests/fixtures/photo-small.jpg'),422);
 ok('Photos under 512 × 512 are refused with a clear message',small.body.error.includes('400 × 300')&&small.body.error.includes('512 × 512'));
 await sendPhoto('broken.jpg','image/jpeg',Buffer.concat([jpeg.subarray(0,200)]),415);ok('Broken image files are refused',true);
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
 const share=await request('/api/generations/'+generationId+'/share',{method:'POST',cookie:userCookie,data:{}});const signedUrl=(await mf.dispatchFetch(config.APP_ORIGIN+'/api/share/'+share.body.id+'/video',{redirect:'manual'})).headers.get('location');const shared=await mf.dispatchFetch(signedUrl);ok('Signed share link works without account login',shared.status===200);await shared.arrayBuffer();const broken=new URL(signedUrl);broken.searchParams.set('signature','bad');await request(broken.pathname+broken.search,{expected:403});ok('Tampered share link is rejected',true);
 const defaultGuides=(await request('/api/admin/settings',{cookie:adminCookie})).body.photoGuidelines;ok('Photo guidelines default to the built-in lists',defaultGuides.do.length>0&&defaultGuides.dont.length>0);
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{photoGuidelines:{do:['Face the camera','',' Good light '],dont:['No sunglasses']}}});
 const savedGuides=(await request('/api/admin/settings',{cookie:adminCookie})).body.photoGuidelines;ok('Admin-edited photo guidelines are saved and trimmed',JSON.stringify(savedGuides)===JSON.stringify({do:['Face the camera','Good light'],dont:['No sunglasses']}));
 ok('Edited photo guidelines appear on the public template page',(await request('/template/formula-driver')).body.includes('Face the camera'));
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{photoGuidelines:{do:[],dont:[]}},expected:400});ok('Photo guidelines cannot be emptied',true);
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
 // C21 — report a problem and the free redo
 const rep=await request('/api/generations/'+generationId+'/report',{method:'POST',cookie:userCookie,data:{reason:'wrong_face',comment:'The face is not mine'},expected:201});ok('Customer can report a finished video',rep.body.report.status==='open');
 await request('/api/generations/'+generationId+'/report',{method:'POST',cookie:userCookie,data:{reason:'glitches'},expected:409});ok('Only one open report per video',true);
 await request('/api/generations/'+generationId+'/report',{method:'POST',cookie:second.cookie,data:{reason:'other'},expected:404});ok('A customer cannot report someone else’s video',true);
 await request('/api/generations/'+generationId,{method:'DELETE',cookie:userCookie,expected:409});ok('A reported video cannot be deleted while under review',true);
 await request('/api/uploads/'+u.body.id,{method:'DELETE',cookie:userCookie,expected:409});ok('A photo in a reported video cannot be deleted while under review',true);
 const queue=await request('/api/admin/reports',{cookie:adminCookie});const myReport=queue.body.reports.find(r=>r.generationId===generationId);ok('The report appears in the admin queue as open',myReport&&myReport.status==='open');
 const caseDetail=await request('/api/admin/reports/'+myReport.id,{cookie:adminCookie});ok('Report detail shows the video and the uploaded photo',!!caseDetail.body.video&&caseDetail.body.photos.length===1);
 const balBefore=(await balance(userCookie)).available;
 const resolve=await request('/api/admin/reports/'+myReport.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'approve'}});const redoId=resolve.body.redoGenerationId;ok('Approving the report starts a free redo',!!redoId);
 const redo=await waitDone(userCookie,redoId);ok('The free redo completes and is marked as a redo',redo.g.status==='completed'&&redo.g.isRedo===true);
 ok('The free redo costs the customer nothing',(await balance(userCookie)).available===balBefore);
 ok('A goodwill credit is recorded in the ledger',(await request('/api/credits/history',{cookie:userCookie})).body.transactions.some(t=>t.kind==='goodwill'));
 ok('The resolved report is approved with the redo linked',(await request('/api/admin/reports/'+myReport.id,{cookie:adminCookie})).body.report.redoGenerationId===redoId);
 const rep2=await request('/api/generations/'+redoId+'/report',{method:'POST',cookie:userCookie,data:{reason:'mismatch'},expected:201});ok('A free redo can itself be reported',rep2.body.report.status==='open');
 const report2=(await request('/api/admin/reports',{cookie:adminCookie})).body.reports.find(r=>r.generationId===redoId);
 await request('/api/admin/reports/'+report2.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'reject_photo'},expected:400});ok('Rejecting as photo-not-suitable needs a guideline',true);
 await request('/api/admin/reports/'+report2.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'reject_photo',guideline:'Face clearly visible and facing the camera'}});
 const redoCard=(await request('/api/generations?status=completed',{cookie:userCookie})).body.generations.find(g=>g.id===redoId);
 ok('A rejected report shows photo-not-suitable to the customer',redoCard.report.status==='rejected'&&redoCard.report.resolution==='photo_unsuitable'&&redoCard.report.guideline==='Face clearly visible and facing the camera');

 // C22 — maintenance switch
 const curFormula=(await request('/api/templates')).body.templates.find(t=>t.slug==='formula-driver');
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{maintenance:{creationsPaused:true,purchasesPaused:false,message:'Paused for maintenance'}}});
 ok('Maintenance settings are saved and returned',(await request('/api/admin/settings',{cookie:adminCookie})).body.maintenance.creationsPaused===true);
 const mUp=await upload(userCookie);
 await generate(userCookie,curFormula,[mUp.body.id],{expected:503});ok('Maintenance pauses new video creation',true);
 ok('The template page shows the maintenance message',(await request('/template/formula-driver')).body.includes('Paused for maintenance'));
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{maintenance:{creationsPaused:false,purchasesPaused:true,message:''}}});
 const maintPack=(await request('/api/admin/credit-packages',{method:'POST',cookie:adminCookie,data:{name:'Maint pack',credits:100,prices:{EUR:499},active:true},expected:201})).body.package;
 await request('/api/credits/checkout',{method:'POST',cookie:userCookie,data:{packageId:maintPack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:503});ok('Maintenance pauses new credit purchases',true);
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{maintenance:{creationsPaused:false,purchasesPaused:false,message:''}}});
 const resumed=await generate(userCookie,curFormula,[(await upload(userCookie)).body.id]);await waitDone(userCookie,resumed.body.generationId);ok('Creation works again after maintenance is lifted',true);

 // C23 — spending safety limits
 await grant(reg.body.user.id,10000);
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{limits:{concurrent:1,daily:0,studioDailyCost:0}}});
 ok('Spending limits are saved and returned',(await request('/api/admin/settings',{cookie:adminCookie})).body.limits.concurrent===1);
 const lim1=await generate(userCookie,curFormula,[(await upload(userCookie)).body.id]);
 await generate(userCookie,curFormula,[(await upload(userCookie)).body.id],{expected:429});ok('A second concurrent video is blocked per customer',true);
 await waitDone(userCookie,lim1.body.generationId);
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{limits:{concurrent:0,daily:1,studioDailyCost:0}}});
 await generate(userCookie,curFormula,[(await upload(userCookie)).body.id],{expected:429});ok('The per-customer daily limit blocks further videos',true);
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{limits:{concurrent:0,daily:0,studioDailyCost:1}}});
 await generate(userCookie,curFormula,[(await upload(userCookie)).body.id],{expected:503});ok('The studio-wide daily AI cost cap pauses creation',true);
 ok('The spend cap records an alert event',!!(await db.prepare("SELECT id FROM analytics_events WHERE name='spend_cap_reached'").first()));
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{limits:{concurrent:3,daily:20,studioDailyCost:0}}});

 // C19 — exchange rates + margins in the selling currency
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{exchangeRates:{EUR:0.92,ALL:85}}});
 ok('Exchange rates are saved and returned',(await request('/api/admin/settings',{cookie:adminCookie})).body.exchangeRates.ALL===85);
 const dash19=(await request('/api/admin/dashboard',{cookie:adminCookie})).body;
 ok('Dashboard financials use selling currencies, not USD',dash19.financials.some(f=>f.currency==='EUR')&&!dash19.financials.some(f=>f.currency==='USD'));
 ok('Profitable templates are computed in a selling currency',dash19.profitable.length>0&&dash19.profitable.every(x=>x.currency!=='USD')&&dash19.profitable.some(x=>x.currency==='EUR'));
 const adminTpls19=(await request('/api/admin/templates',{cookie:adminCookie})).body.templates;
 ok('Template margins show in the accounting currency, not blank USD',adminTpls19.every(t=>t.costCurrency==='EUR')&&adminTpls19.some(t=>t.creditValue!==null));

 // C4.2 / F16 — the PBKDF2 iteration count is read from the stored hash
 await request('/api/auth/register',{method:'POST',data:{name:'Hash User',email:'hash@studio.test',password:'Hash-password-123',acceptTerms:true,confirmAge:true},expected:201});
 const storedHash=(await db.prepare("SELECT password_hash FROM users WHERE email='hash@studio.test'").first()).password_hash;
 ok('New password hashes embed the iteration count',typeof storedHash==='string'&&storedHash.startsWith('pbkdf2$100000$'));
 const salt2=randomBytes(32).toString('hex');const customHash='pbkdf2$150000$'+salt2+'$'+pbkdf2Sync('Rehashed-pass-456',salt2,150000,32,'sha256').toString('hex');
 await db.prepare("UPDATE users SET password_hash=? WHERE email='hash@studio.test'").bind(customHash).run();
 const relog=await request('/api/auth/login',{method:'POST',data:{email:'hash@studio.test',password:'Rehashed-pass-456'}});
 ok('Login verifies a hash with a non-default iteration count',relog.body.user?.email==='hash@studio.test');
 await request('/api/auth/login',{method:'POST',data:{email:'hash@studio.test',password:'wrong-password-000'},expected:401});ok('A wrong password still fails against a non-default-iteration hash',true);

 // C8 — anonymous page/template views are recorded (dashboard funnel)
 await request('/api/analytics',{method:'POST',data:{name:'template_view',templateId:formula.id}});
 ok('Anonymous template views are recorded with no user',!!(await db.prepare("SELECT id FROM analytics_events WHERE name='template_view' AND user_id IS NULL").first()));

 await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{status:'suspended'}});await request('/api/favorites',{cookie:second.cookie,expected:401});ok('Suspending a user revokes sessions',true);await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{status:'active'}});ok('Admin can reactivate users',true);
 const detail=(await request('/api/admin/users/'+second.body.user.id,{cookie:adminCookie})).body;
 ok('Customer page returns profile, credits, creations and activity',detail.user.email===second.body.user.email&&typeof detail.balance.available==='number'&&Array.isArray(detail.creations.recent)&&detail.activity.some(a=>a.action==='user.suspended'));
 await request('/api/admin/users/'+second.body.user.id,{cookie:userCookie,expected:403});ok('Customers cannot open the customer page API',true);
 await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{name:'Renamed Customer'}});
 ok('Admin renames a customer',(await request('/api/admin/users/'+second.body.user.id,{cookie:adminCookie})).body.user.name==='Renamed Customer');
 await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{role:'admin'},expected:403});await request('/api/admin/users/'+second.body.user.id,{method:'PATCH',cookie:adminCookie,data:{credits:5},expected:400});ok('A role change needs the admin password, and unknown fields are rejected',true);
 ok('Customer purchases are listed per customer',Array.isArray((await request('/api/admin/users/'+second.body.user.id+'/purchases',{cookie:adminCookie})).body.purchases));
 // Content refusals (C2): each refusal returns the credits and adds a strike; the third blocks the account until an admin unblocks it.
 const refuser=await request('/api/auth/register',{method:'POST',data:{name:'Refusal Tester',email:'refusals@studio.test',password:'Test-password-123',acceptTerms:true,confirmAge:true},expected:201});const rc=refuser.cookie;
 await grant(refuser.body.user.id,3000);
 const traveler=templates.find(t=>t.slug==='time-traveler');
 const travelerAdmin=(await request('/api/admin/templates/'+traveler.id,{cookie:adminCookie})).body.template;
 await request('/api/admin/templates/'+traveler.id,{method:'PATCH',cookie:adminCookie,data:{...travelerAdmin,workflow:travelerAdmin.workflow.map(st=>({...st,settings:{...st.settings,simulateRefusal:true}}))}});
 const refPhoto=new FormData();refPhoto.append('file',new File([await readFile('public/media/formula-driver.webp')],'me.webp',{type:'image/webp'}));
 const refUpload=(await request('/api/uploads',{method:'POST',cookie:rc,data:refPhoto,expected:201})).body.id;
 const refuserMe=async()=>(await request('/api/me',{cookie:rc})).body.user;
 for(let n=1;n<=3;n++){
  const started=await generate(rc,traveler,[refUpload]);const done=await waitDone(rc,started.body.generationId);
  ok(`Refusal ${n}: the video is marked refused and its credits are returned`,done.g.status==='refused'&&done.g.creditStatus==='released'&&(await balance(rc)).available===3000);
  const u=await refuserMe();ok(`Refusal ${n}: the account has ${n} of 3 strikes`,u.contentStrikes===n&&u.blocked===(n===3));
 }
 const blockedUpload=new FormData();blockedUpload.append('file',new File([await readFile('public/media/formula-driver.webp')],'me.webp',{type:'image/webp'}));
 await request('/api/uploads',{method:'POST',cookie:rc,data:blockedUpload,expected:403});
 await generate(rc,formula,[refUpload],{expected:403});
 await request('/api/credits/checkout',{method:'POST',cookie:rc,data:{packageId:'pack_any',currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:403});
 ok('A blocked account cannot upload, create videos or buy credits',true);
 const refDetail=(await request('/api/admin/users/'+refuser.body.user.id,{cookie:adminCookie})).body;
 ok('The customer page shows the block, the refused videos and their photos',refDetail.user.blocked_at&&refDetail.user.content_strikes===3&&refDetail.refusals.length===3&&refDetail.refusals[0].photos[0]==='/api/media/'+refUpload&&refDetail.activity.some(a=>a.action==='user.blocked'));
 await request('/api/admin/users/'+refuser.body.user.id,{method:'PATCH',cookie:adminCookie,data:{unblock:true}});
 const unblocked=await refuserMe();const again=new FormData();again.append('file',new File([await readFile('public/media/formula-driver.webp')],'me.webp',{type:'image/webp'}));
 ok('Unblocking resets the strikes and the customer can upload again',unblocked.contentStrikes===0&&!unblocked.blocked&&(await request('/api/uploads',{method:'POST',cookie:rc,data:again,expected:201})).body.id);
 await request('/api/admin/templates/'+traveler.id,{method:'PATCH',cookie:adminCookie,data:travelerAdmin});
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{name:'Updated QA'}});ok('Account changes persist',(await request('/api/me',{cookie:userCookie})).body.user.name==='Updated QA');
 await request('/api/account',{method:'PATCH',cookie:userCookie,headers:{origin:'https://evil.test','sec-fetch-site':'cross-site'},data:{name:'Evil'},expected:403});ok('Cross-site mutation blocked',true);
 await request('/api/webhooks/pok?purchase=cp_forged&sig=00',{method:'POST',data:{id:'forged'},expected:400});ok('POK webhook without the studio signature rejected',true);
 // Credit pack bought through the demo checkout; a signed POK webhook for a non-POK purchase changes nothing.
 const pack=(await request('/api/admin/credit-packages',{method:'POST',cookie:adminCookie,data:{name:'QA pack',credits:300,prices:{EUR:299},active:true},expected:201})).body.package;
 const purchase=(await request('/api/credits/checkout',{method:'POST',cookie:userCookie,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
 const beforePack=(await balance(userCookie)).available;
 const sig=createHmac('sha256',config.APP_SECRET).update('pok-webhook:'+purchase.purchaseId).digest('hex');
 await request(`/api/webhooks/pok?purchase=${purchase.purchaseId}&sig=${sig}`,{method:'POST',data:{data:{sdkOrder:{id:'ord_fake',capturedAmount:2.99}}}});
 ok('A signed POK webhook cannot pay a purchase by itself',(await balance(userCookie)).available===beforePack);
 for(let i=0;i<2;i++)await request(`/api/credits/purchases/${purchase.purchaseId}/pay`,{method:'POST',cookie:userCookie,data:{result:'success'}});
 ok('Test checkout grants pack credits once and tolerates replay',(await balance(userCookie)).available===beforePack+300);
 // Creation/file deletion proves bytes are removed, rather than merely hidden.
 const assetKey=outputs.results[0].storage_key;await request('/api/generations/'+generationId,{method:'DELETE',cookie:userCookie});ok('Delete creation removes the video from object storage',await bucket.get(assetKey)===null);await request('/api/media/'+result.g.assetId,{cookie:userCookie,expected:404});
 const orphan=await upload(userCookie);const orphanDb=await db.prepare('SELECT storage_key FROM user_uploads WHERE id=?').bind(orphan.body.id).first();await request('/api/uploads/'+orphan.body.id,{method:'DELETE',cookie:userCookie});ok('Delete upload removes stored bytes',await bucket.get(orphanDb.storage_key)===null);
 const dup=await request('/api/admin/templates/'+testTemplate.id+'/duplicate',{method:'POST',cookie:adminCookie,data:{},expected:201});ok('Admin duplicates a template as a draft',!dup.body.template.active&&dup.body.template.id!==testTemplate.id);await request('/api/admin/templates/'+dup.body.template.id,{method:'DELETE',cookie:adminCookie});await request('/api/admin/templates/'+dup.body.template.id+'?permanent=1',{method:'DELETE',cookie:adminCookie});ok('Admin removes a template',!(await request('/api/admin/templates',{cookie:adminCookie})).body.templates.some(t=>t.id===dup.body.template.id));
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
 await request('/api/admin/templates/'+mediaCopy.id,{method:'DELETE',cookie:adminCookie});await request('/api/admin/templates/'+mediaCopy.id+'?permanent=1',{method:'DELETE',cookie:adminCookie});
 ok('Deleting the last template using a preview removes the file and its bytes',!await keyOf(ma.body.id)&&!await bucket.get(aKey));
 ok('Previews still used by another template are kept',!!await keyOf(mb.body.id)&&!!await keyOf(mv.body.id)&&!!await keyOf(mc.body.id));
 await db.prepare('UPDATE generations SET thumbnail=? WHERE id=?').bind(me.body.url,generationId).run();
 await db.prepare('UPDATE template_media SET created_at=? WHERE id IN (?,?,?)').bind(Date.now()-25*3600000,mb.body.id,md.body.id,me.body.id).run();
 await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('last_maintenance','0')").run();await request('/api/queue/dispatch',{method:'POST',headers:{authorization:'Bearer '+config.QUEUE_SECRET}});
 ok('Hourly sweep removes old uploads that were never saved to a template',!await keyOf(md.body.id));
 ok('Sweep keeps media used by a template or as a past creation poster',!!await keyOf(mb.body.id)&&!!await keyOf(me.body.id));
 const mf2=await adminMedia('delete-me.webp','image/webp',webp);const fKey=await keyOf(mf2.body.id);await request('/api/admin/media/'+mf2.body.id,{method:'DELETE',cookie:adminCookie});
 ok('Unused media can be deleted from the library',!await keyOf(mf2.body.id)&&!await bucket.get(fKey));
 await request('/api/admin/templates/'+mediaTemplate.id,{method:'DELETE',cookie:adminCookie});await request('/api/admin/templates/'+mediaTemplate.id+'?permanent=1',{method:'DELETE',cookie:adminCookie});
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
 const clean=await request('/api/auth/register',{method:'POST',data:{name:'Delete Test',email:'delete@studio.test',password:'Delete-password-123',acceptTerms:true,confirmAge:true},expected:201});await grant(clean.body.user.id,10);const cleanUpload=await upload(clean.cookie);await request('/api/account',{method:'DELETE',cookie:clean.cookie,data:{password:'Delete-password-123'}});ok('Account deletion removes the user and uploads',!(await db.prepare('SELECT id FROM users WHERE id=?').bind(clean.body.user.id).first())&&!(await db.prepare('SELECT id FROM user_uploads WHERE id=?').bind(cleanUpload.body.id).first()));
 // C27: the template page says what the customer receives and links related templates (same category first, never itself).
 const detailPage=(await request('/template/formula-driver')).text;const sameCategory=templates.filter(t=>t.category===formula.category&&t.id!==formula.id);
 ok('Template page shows what you receive and related templates',detailPage.includes('What you receive')&&detailPage.includes('MP4')&&detailPage.includes('You might also like')&&(sameCategory.length===0||detailPage.includes('/template/'+sameCategory[0].slug))&&(detailPage.match(/href="\/template\/formula-driver"/g)||[]).length===0);
 // C31.4: a template can add its own photo tips, shown with the studio-wide guidelines on its page.
 const tipsTpl=(await request('/api/admin/templates/'+formula.id,{cookie:adminCookie})).body.template;
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:adminCookie,data:{...tipsTpl,photoTips:'Helmet off, face visible\n  \nLook straight at the camera'}});
 const tipsPage=(await request('/template/formula-driver')).text;
 ok('Per-template photo tips are saved and shown on the template page',tipsPage.includes('Helmet off, face visible')&&tipsPage.includes('Look straight at the camera')&&(await request('/api/admin/templates/'+formula.id,{cookie:adminCookie})).body.template.photoTips.includes('Helmet off'));
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:adminCookie,data:{...tipsTpl,photoTips:''}});
 // C29: every storefront page starts with a skip link to the main content.
 const home=(await request('/')).text;ok('Pages have a skip link to the main content',home.includes('class="skip-link" href="#main"')&&home.includes('id="main"'));
 // C10: Albanian is the default storefront language; English with the switcher cookie; the admin and its API stay English.
 const sqHome=(await request('/',{lang:null})).text,enHome=(await request('/',{lang:'en'})).text;
 ok('The storefront is in Albanian by default, with html lang="sq"',sqHome.includes('lang="sq"')&&sqHome.includes('Shfleto')&&sqHome.includes('Krijo një video')&&!sqHome.includes('>Create a video'));
 ok('The language switch cookie shows English',enHome.includes('lang="en"')&&enHome.includes('Create a video')&&enHome.includes('Shqip'));
 const sqError=await request('/api/auth/login',{method:'POST',lang:null,data:{email:'nobody@studio.test',password:'Wrong-password-1'},expected:401});
 ok('Customer API errors follow the language',sqError.body.error==='Email-i ose fjalëkalimi është i pasaktë.');
 const adminSq=await request('/api/admin/templates/missing-template',{cookie:adminCookie,lang:'sq',expected:404});ok('Admin API errors stay in English',adminSq.body.error==='Template not found.');
 ok('Albanian legal pages and FAQ',(await request('/terms',{lang:null})).text.includes('Fotot dhe lejet e tua')&&(await request('/faq',{lang:null})).text.includes('A skadojnë kreditet?'));
 await request('/account',{cookie:userCookie,lang:'en'});ok('A signed-in customer’s language is remembered for emails',(await db.prepare("SELECT locale FROM users WHERE email='qa@studio.test'").first()).locale==='en');
 // V11/V31.2: an admin sends a reset link from the customer page (demo: the link is returned instead of emailed); the page lists reports.
 const resetUser=await request('/api/auth/register',{method:'POST',data:{name:'Reset Me',email:'resetme@studio.test',password:'Reset-password-1',acceptTerms:true,confirmAge:true},expected:201});
 await request('/api/admin/users/'+resetUser.body.user.id+'/reset-link',{method:'POST',cookie:userCookie,data:{},expected:403});
 const resetLink=(await request('/api/admin/users/'+resetUser.body.user.id+'/reset-link',{method:'POST',cookie:adminCookie,data:{}})).body;
 await request('/api/auth/reset',{method:'POST',data:{token:new URL(resetLink.url).searchParams.get('token'),password:'Brand-new-password-2'}});
 const relogged=await request('/api/auth/login',{method:'POST',data:{email:'resetme@studio.test',password:'Brand-new-password-2'}});
 const resetDetail=(await request('/api/admin/users/'+resetUser.body.user.id,{cookie:adminCookie})).body;
 ok('Admin reset link lets the customer choose a new password and is logged',resetLink.sent===false&&!!relogged.cookie&&resetDetail.activity.some(a=>a.action==='user.reset-link')&&Array.isArray(resetDetail.reports)&&resetDetail.user.two_factor===false);
 // V12: CSV exports for admins only, with formula injection neutralised.
 await request('/api/admin/export/users',{cookie:userCookie,expected:403});await request('/api/admin/export/nope',{cookie:adminCookie,expected:404});
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{name:'=HYPERLINK("x")'}});
 const usersCsv=await request('/api/admin/export/users',{cookie:adminCookie}),ledgerCsv=await request('/api/admin/export/ledger',{cookie:adminCookie}),purchasesCsv=await request('/api/admin/export/purchases',{cookie:adminCookie});
 ok('Admin CSV exports for users, ledger and purchases',usersCsv.response.headers.get('content-type').startsWith('text/csv')&&usersCsv.response.headers.get('content-disposition').includes('studio-users-')&&usersCsv.text.includes('qa@studio.test')&&ledgerCsv.text.split('\r\n')[0].includes('Transaction ID')&&purchasesCsv.text.split('\r\n')[0].includes('Purchase ID'));
 ok('CSV cells cannot run as spreadsheet formulas',usersCsv.text.includes(`"'=HYPERLINK(""x"")"`)&&!/(^|,)=HYPERLINK/m.test(usersCsv.text));
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{name:'Disposable QA User'}});
 // V13/V14: archive instead of delete, restore, permanent delete only from the archive, manual order, bulk actions, scheduled publishing.
 const arch=(await request('/api/admin/templates',{method:'POST',cookie:adminCookie,data:{...clone,name:'QA Archive Test',slug:'qa-archive-test',active:true,creditCost:300},expected:201})).body.template;
 await request('/api/admin/templates/'+arch.id+'?permanent=1',{method:'DELETE',cookie:adminCookie,expected:409});
 await request('/api/admin/templates/'+arch.id,{method:'DELETE',cookie:adminCookie});
 const archList=(await request('/api/admin/templates',{cookie:adminCookie})).body;const archivedRow=archList.templates.find(t=>t.id===arch.id);
 ok('Deleting archives the template and hides it from the catalog',archivedRow.archivedAt&&!archivedRow.active&&!(await request('/api/templates?limit=100')).body.templates.some(t=>t.id===arch.id)&&(await request('/template/qa-archive-test',{expected:404})));
 await request('/api/admin/templates/'+arch.id,{method:'PATCH',cookie:adminCookie,data:{...arch,active:true},expected:409});
 await request('/api/admin/templates/'+arch.id+'/restore',{method:'POST',cookie:adminCookie,data:{}});
 const bulkResult=(await request('/api/admin/templates/bulk',{method:'POST',cookie:adminCookie,data:{ids:[arch.id],action:'publish'}})).body;
 ok('Restore brings it back as a draft and bulk publish puts it live',bulkResult.done===1&&(await request('/api/templates?limit=100')).body.templates.some(t=>t.id===arch.id));
 const catalogIds=(await request('/api/admin/templates',{cookie:adminCookie})).body.templates.filter(t=>!t.archivedAt).map(t=>t.id);
 await request('/api/admin/templates/order',{method:'POST',cookie:adminCookie,data:{ids:[arch.id,...catalogIds.filter(id=>id!==arch.id)]}});
 ok('Manual order puts a template first under Recommended',(await request('/api/templates?limit=5')).body.templates[0].id===arch.id);
 const scheduled={...arch,active:false,publishAt:Date.now()+1500};
 await request('/api/admin/templates/'+arch.id,{method:'PATCH',cookie:adminCookie,data:{...arch,active:false,publishAt:Date.now()-3600000},expected:400});
 await request('/api/admin/templates/'+arch.id,{method:'PATCH',cookie:adminCookie,data:scheduled});
 const hiddenBefore=!(await request('/api/templates?limit=100')).body.templates.some(t=>t.id===arch.id);
 await new Promise(r=>setTimeout(r,1700));await request('/api/admin/operations/dispatch',{method:'POST',cookie:adminCookie,data:{}});
 ok('A scheduled template goes live at its time',hiddenBefore&&(await request('/api/templates?limit=100')).body.templates.some(t=>t.id===arch.id));
 await request('/api/admin/templates/bulk',{method:'POST',cookie:adminCookie,data:{ids:[arch.id],action:'archive'}});await request('/api/admin/templates/'+arch.id+'?permanent=1',{method:'DELETE',cookie:adminCookie});
 ok('A template is deleted for good only from the archive',!(await request('/api/admin/templates',{cookie:adminCookie})).body.templates.some(t=>t.id===arch.id));
 // V20: make a finished video again with the same photo, charged at the template's current cost.
 await grant(reg.body.user.id,1000);
 const finished=(await request('/api/generations?status=completed&limit=24',{cookie:userCookie})).body.generations.find(g=>g.repeatCost!==null);
 await request('/api/generations/'+finished.id+'/again',{method:'POST',cookie:userCookie,data:{idempotencyKey:randomUUID(),expectedCost:finished.repeatCost+1},expected:409});
 const beforeAgain=await balance(userCookie);const remade=(await request('/api/generations/'+finished.id+'/again',{method:'POST',cookie:userCookie,data:{idempotencyKey:randomUUID(),expectedCost:finished.repeatCost},expected:201})).body;
 await request('/api/generations/'+finished.id+'/again',{method:'POST',cookie:relogged.cookie,data:{idempotencyKey:randomUUID(),expectedCost:finished.repeatCost},expected:404});
 ok('Make it again starts a new creation from the same photo and reserves its credits',remade.generationId!==finished.id&&remade.balance.held-beforeAgain.held===finished.repeatCost&&(await db.prepare('SELECT input_ids FROM generations WHERE id=?').bind(remade.generationId).first()).input_ids===(await db.prepare('SELECT input_ids FROM generations WHERE id=?').bind(finished.id).first()).input_ids);
 await waitDone(userCookie,remade.generationId);
 // V3: a share page with its own link, an Open Graph preview, a view count, and the owner can stop sharing.
 const toShare=(await request('/api/generations?status=completed&limit=24',{cookie:userCookie})).body.generations.find(g=>g.assetId);
 await request('/api/generations/'+toShare.id+'/share',{method:'POST',cookie:relogged.cookie,data:{},expected:404});
 const shareInfo=(await request('/api/generations/'+toShare.id+'/share',{method:'POST',cookie:userCookie,data:{}})).body;const sharedAgain=(await request('/api/generations/'+toShare.id+'/share',{method:'POST',cookie:userCookie,data:{}})).body;
 const sharePath=new URL(shareInfo.url).pathname;const sharePage=(await request(sharePath)).text;
 const sharedVid=await mf.dispatchFetch(config.APP_ORIGIN+'/api/share/'+shareInfo.id+'/video',{redirect:'manual'});
 ok('Sharing creates one stable page with a video preview card',sharedAgain.id===shareInfo.id&&sharePage.includes('og:video')&&sharePage.includes('og:image')&&sharePage.includes('Make your own')&&sharedVid.status===302&&sharedVid.headers.get('location').includes('signature='));
 ok('My creations shows the share link',(await request('/api/generations/'+toShare.id,{cookie:userCookie})).body.generations[0].shareUrl===shareInfo.url);
 await request('/api/generations/'+toShare.id+'/share',{method:'DELETE',cookie:userCookie});
 ok('Stopping sharing takes the page and video offline but keeps the creation',(await request(sharePath,{expected:404}))&&(await mf.dispatchFetch(config.APP_ORIGIN+'/api/share/'+shareInfo.id+'/video',{redirect:'manual'})).status===404&&(await request('/api/generations/'+toShare.id,{cookie:userCookie})).body.generations[0].status==='completed');
 // V27: a customer who can't afford the cheapest video sees a reminder with a way to buy credits; one who can, doesn't.
 const lowPage=(await request('/creations',{cookie:relogged.cookie})).text,richPage=(await request('/creations',{cookie:userCookie})).text;
 ok('Low balance reminder shows only when credits can’t pay for a video',lowPage.includes('class="low-balance"')&&lowPage.includes('not enough for a video')&&!richPage.includes('class="low-balance"'));
 // V7: installable app: manifest, theme colour and home-screen icon on every page; the manifest, worker and offline page exist.
 const appHome=(await request('/')).text;const {readFile:rf}=await import('node:fs/promises');const manifest=JSON.parse(await rf('public/manifest.webmanifest','utf8'));
 ok('Pages link the app manifest and home-screen icon',appHome.includes('rel="manifest"')&&appHome.includes('apple-touch-icon')&&appHome.includes('theme-color')&&manifest.display==='standalone'&&manifest.icons.some(i=>i.purpose==='maskable')&&(await rf('public/sw.js','utf8')).includes('offline.html'));
 // V18: change the email address (demo studio without email: changes at once; password required; addresses stay unique).
 await request('/api/account/email',{method:'POST',cookie:relogged.cookie,data:{email:'qa@studio.test',password:'Brand-new-password-2'},expected:409});
 await request('/api/account/email',{method:'POST',cookie:relogged.cookie,data:{email:'moved@studio.test',password:'wrong-password-9'},expected:403});
 const moved=(await request('/api/account/email',{method:'POST',cookie:relogged.cookie,data:{email:'Moved@Studio.test',password:'Brand-new-password-2'}})).body;
 ok('A customer changes their email with their password',moved.changed===true&&!!(await request('/api/auth/login',{method:'POST',data:{email:'moved@studio.test',password:'Brand-new-password-2'}})).cookie);
 // V30: a removal request for a shared video hides it at once; staff then remove it (the owner's video is deleted) or keep it.
 const rrGen=(await request('/api/generations?status=completed&limit=24',{cookie:userCookie})).body.generations.find(g=>g.assetId);
 const rrShare=(await request('/api/generations/'+rrGen.id+'/share',{method:'POST',cookie:userCookie,data:{}})).body;
 await request('/api/removal-requests',{method:'POST',data:{video:rrShare.url,name:'X',email:'nope',relation:'self',details:'short',confirm:false},expected:400});
 const rr=(await request('/api/removal-requests',{method:'POST',data:{video:rrShare.url,name:'Ana Person',email:'ana@example.test',relation:'self',details:'This is me and I never agreed to this video.',confirm:true},expected:201})).body;
 ok('A removal request hides the shared video immediately',rr.hidden===true&&(await request(new URL(rrShare.url).pathname,{expected:404})));
 const rrQueue=(await request('/api/admin/removals',{cookie:adminCookie})).body;const rrItem=rrQueue.requests.find(x=>x.video?.generationId===rrGen.id);
 await request('/api/admin/removals',{cookie:userCookie,expected:403});
 await request('/api/admin/removals/'+rrItem.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'remove'}});
 ok('Staff remove the video from the removal queue',rrItem.status==='open'&&(await request('/api/generations/'+rrGen.id,{cookie:userCookie,expected:404}))&&(await request('/api/admin/removals?status=removed',{cookie:adminCookie})).body.requests.some(x=>x.id===rrItem.id));
 await request('/api/admin/removals/'+rrItem.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'keep'},expected:409});
 const described=(await request('/api/removal-requests',{method:'POST',data:{video:'A video of me on Instagram',name:'Ben Person',email:'ben@example.test',relation:'other',details:'Someone posted a video of my friend.',confirm:true},expected:201})).body;
 const benItem=(await request('/api/admin/removals',{cookie:adminCookie})).body.requests.find(x=>x.email==='ben@example.test');
 await request('/api/admin/removals/'+benItem.id+'/resolve',{method:'POST',cookie:adminCookie,data:{decision:'keep',note:'We could not find this video.'}});
 ok('A request without a link is reviewed by hand and can be closed',described.hidden===false&&(await request('/api/admin/removals?status=kept',{cookie:adminCookie})).body.requests.some(x=>x.id===benItem.id&&x.adminNote));
 // V33: each save keeps a version; restore brings back the old prompt and keeps the history.
 const hist=(await request('/api/admin/templates',{method:'POST',cookie:adminCookie,data:{...clone,name:'QA History',slug:'qa-history',hiddenPrompt:'First prompt',active:false},expected:201})).body.template;
 await request('/api/admin/templates/'+hist.id,{method:'PATCH',cookie:adminCookie,data:{...hist,hiddenPrompt:'Second prompt'}});
 await request('/api/admin/templates/'+hist.id,{method:'PATCH',cookie:adminCookie,data:{...hist,hiddenPrompt:'Second prompt'}});
 const versions=(await request('/api/admin/templates/'+hist.id+'/versions',{cookie:adminCookie})).body.versions;
 ok('Template saves keep a history of changes (unchanged saves add nothing)',versions.length===2&&versions[0].changes.includes('hidden prompt')&&versions[1].snapshot.hiddenPrompt==='First prompt');
 const restored=(await request('/api/admin/templates/'+hist.id+'/versions/'+versions[1].id+'/restore',{method:'POST',cookie:adminCookie,data:{}})).body.template;
 ok('Restoring a version brings back its prompt and adds to the history',restored.hiddenPrompt==='First prompt'&&(await request('/api/admin/templates/'+hist.id,{cookie:adminCookie})).body.template.hiddenPrompt==='First prompt'&&(await request('/api/admin/templates/'+hist.id+'/versions',{cookie:adminCookie})).body.versions.length===3);
 await request('/api/admin/templates/'+hist.id,{method:'DELETE',cookie:adminCookie});await request('/api/admin/templates/'+hist.id+'?permanent=1',{method:'DELETE',cookie:adminCookie});
 // V34: per-template statistics.
 await request('/api/analytics',{method:'POST',data:{name:'template_view',templateId:formula.id}});
 const st=(await request('/api/admin/template-stats?days=all',{cookie:adminCookie})).body.stats[formula.id];
 await request('/api/admin/template-stats?days=5',{cookie:adminCookie,expected:400});await request('/api/admin/template-stats',{cookie:userCookie,expected:403});
 ok('Template statistics count views, creations, success, time and credits',st.views>=1&&st.creations>=1&&st.completed>=1&&st.successRate>0&&st.successRate<=1&&st.avgSeconds!==null&&st.credits>0);
 // V36: customers switch news emails on and off in Account; sending needs email to be configured.
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{marketingOptIn:true}});const onAt=(await db.prepare("SELECT marketing_opt_in,marketing_opt_in_at FROM users WHERE email='qa@studio.test'").first());
 await request('/api/account',{method:'PATCH',cookie:userCookie,data:{marketingOptIn:false}});
 ok('Customers turn news emails on and off, with the consent time recorded',onAt.marketing_opt_in===1&&onAt.marketing_opt_in_at>0&&(await db.prepare("SELECT marketing_opt_in FROM users WHERE email='qa@studio.test'").first()).marketing_opt_in===0);
 await request('/api/admin/announcements',{method:'POST',cookie:adminCookie,data:{subjectSq:'Lajm',bodySq:'Një lajm i ri për ju.',subjectEn:'News',bodyEn:'Some news for you.'},expected:503});
 // V43: customers suggest templates and vote; the admin plans or declines them (declined ideas are hidden).
 await request('/api/ideas',{method:'POST',data:{title:'Space'},expected:401});
 const idea=(await request('/api/ideas',{method:'POST',cookie:userCookie,data:{title:'Bollywood dance',details:'Colourful wedding dance'},expected:201})).body;
 await request('/api/ideas/'+idea.id+'/vote',{method:'POST',cookie:relogged.cookie,data:{}});
 const ideas=(await request('/api/ideas',{cookie:relogged.cookie})).body.ideas;const mineIdea=ideas.find(i=>i.id===idea.id);
 await request('/api/ideas/'+idea.id+'/vote',{method:'POST',cookie:relogged.cookie,data:{}});
 ok('Customers suggest template ideas and vote once each',mineIdea.votes===2&&mineIdea.voted&&(await request('/api/ideas')).body.ideas.find(i=>i.id===idea.id).votes===1);
 await request('/api/admin/ideas/'+idea.id,{method:'PATCH',cookie:adminCookie,data:{status:'declined'}});
 ok('Declined ideas are hidden from customers',!(await request('/api/ideas')).body.ideas.some(i=>i.id===idea.id)&&(await request('/api/admin/ideas',{cookie:adminCookie})).body.ideas.some(i=>i.id===idea.id&&i.status==='declined')&&(await request('/ideas')).text.includes('What should we make next?'));
 // V6/V40: ratings, opt-in community gallery and feed with likes; stopping sharing or staff hiding takes a video out.
 const pub=(await request('/api/generations?status=completed&limit=24',{cookie:userCookie})).body.generations.find(g=>g.assetId&&!g.isPublic);
 await request('/api/generations/'+pub.id+'/rating',{method:'POST',cookie:userCookie,data:{stars:6},expected:400});
 await request('/api/generations/'+pub.id+'/rating',{method:'POST',cookie:relogged.cookie,data:{stars:5},expected:404});
 await request('/api/generations/'+pub.id+'/rating',{method:'POST',cookie:userCookie,data:{stars:5}});
 ok('Customers rate their finished videos',(await request('/api/generations/'+pub.id,{cookie:userCookie})).body.generations[0].rating===5);
 ok('Videos are not public until the owner chooses',!(await request('/api/feed')).body.items.some(i=>i.id===pub.id));
 await request('/api/generations/'+pub.id+'/public',{method:'POST',cookie:userCookie,data:{public:true}});
 const feedItem=(await request('/api/feed')).body.items.find(i=>i.id===pub.id);const pubTpl=(await request('/api/generations/'+pub.id,{cookie:userCookie})).body.generations[0].templateSlug;
 ok('A public video shows in the feed and on its template page',feedItem&&feedItem.video.includes('signature=')&&(await request('/template/'+pubTpl)).text.includes('See what others made'));
 const liked=(await request('/api/generations/'+pub.id+'/like',{method:'POST',cookie:relogged.cookie,data:{}})).body;await request('/api/generations/'+pub.id+'/like',{method:'POST',data:{},expected:401});
 ok('Signed-in customers like public videos',liked.liked&&liked.likes===1&&(await request('/api/feed?sort=popular',{cookie:relogged.cookie})).body.items.find(i=>i.id===pub.id).liked);
 await request('/api/generations/'+pub.id+'/share',{method:'DELETE',cookie:userCookie});
 ok('Stopping sharing also takes the video out of the community',!(await request('/api/feed')).body.items.some(i=>i.id===pub.id)&&!(await request('/api/generations/'+pub.id,{cookie:userCookie})).body.generations[0].isPublic);
 await request('/api/generations/'+pub.id+'/public',{method:'POST',cookie:userCookie,data:{public:true}});await request('/api/admin/feed/'+pub.id+'/hide',{method:'POST',cookie:adminCookie,data:{}});
 ok('Staff can hide a video from the community',!(await request('/api/feed')).body.items.some(i=>i.id===pub.id));
 // V17: saved photos survive the 24-hour cleanup, have a name and a default, and deleting one keeps past videos.
 const keepUp=await upload(userCookie),dropUp=await upload(userCookie);
 await request('/api/uploads/'+keepUp.body.id,{method:'PATCH',cookie:userCookie,data:{saved:true,label:'Me',isDefault:true}});
 await request('/api/uploads/'+keepUp.body.id,{method:'PATCH',cookie:relogged.cookie,data:{saved:true},expected:404});
 await db.prepare('UPDATE user_uploads SET created_at=? WHERE id IN (?,?)').bind(Date.now()-25*3600000,keepUp.body.id,dropUp.body.id).run();
 await db.prepare("UPDATE app_settings SET value='0' WHERE key='last_maintenance'").run();await request('/api/queue/tick',{method:'POST',cookie:userCookie,data:{}});
 const lib=(await request('/api/uploads',{cookie:userCookie})).body.uploads;const kept=lib.find(u=>u.id===keepUp.body.id);
 ok('Saved photos are kept past the 24-hour cleanup with their name and default',kept&&kept.saved&&kept.isDefault&&kept.label==='Me'&&!lib.some(u=>u.id===dropUp.body.id));
 await request('/api/uploads/'+keepUp.body.id,{method:'PATCH',cookie:userCookie,data:{label:'Me again'}});
 ok('Renaming keeps the default photo',(await request('/api/uploads',{cookie:userCookie})).body.uploads.find(u=>u.id===keepUp.body.id).isDefault);
 const savedGen=await generate(userCookie,formula,[keepUp.body.id],{cost:(await request('/api/templates/formula-driver')).body.template.creditCost,expected:201});await waitDone(userCookie,savedGen.body.generationId);
 await request('/api/uploads/'+keepUp.body.id,{method:'DELETE',cookie:userCookie});
 ok('Deleting a saved photo keeps the videos made with it',(await request('/api/generations/'+savedGen.body.generationId,{cookie:userCookie})).body.generations[0].status==='completed');
 // C26: support details and social links from Admin → Settings appear on the Contact page and footer.
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{support:{email:'nope',phone:'',responseTime:'',instagram:'',tiktok:'',facebook:''}},expected:400});
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{support:{email:'',phone:'',responseTime:'',instagram:'http://insecure.example',tiktok:'',facebook:''}},expected:400});
 await request('/api/admin/settings',{method:'PATCH',cookie:adminCookie,data:{support:{email:'help@studio.test',phone:'+355 69 000 0000',responseTime:'Within 1 business day',instagram:'https://instagram.com/studio',tiktok:'',facebook:''}}});
 const contact=(await request('/contact')).text,faq=(await request('/faq')).text;
 ok('Support details from settings show on the Contact page and footer',contact.includes('help@studio.test')&&contact.includes('Within 1 business day')&&contact.includes('https://instagram.com/studio')&&!contact.includes('tiktok.com')&&(await request('/api/admin/settings',{cookie:adminCookie})).body.support.email==='help@studio.test');
 ok('FAQ covers credits, failed videos, privacy and deleting data',['Do credits expire?','My video failed','How do I delete my data?','Why was my video refused?'].every(q=>faq.includes(q.replace("'",'&#x27;'))||faq.includes(q))&&faq.includes('href="/faq"'));
 // C14: the export carries signed download links to the customer's photos and videos, plus consents and reports.
 const exp=(await request('/api/account/export',{cookie:userCookie})).body;const done=exp.generations.find(g=>g.status==='completed'&&g.files.length);
 ok('Account export lists photos and videos with download links',exp.uploads.length>0&&exp.uploads.every(u=>u.downloadUrl.includes('signature='))&&done&&done.files.some(f=>f.kind==='output'&&f.downloadUrl.includes('download=1'))&&exp.consents.termsVersion&&Array.isArray(exp.reports));
 const link=new URL(done.files.find(f=>f.kind==='output').downloadUrl);const fetched=await mf.dispatchFetch(config.APP_ORIGIN+link.pathname+link.search);
 ok('Export download links work without signing in, as attachments',fetched.status===200&&fetched.headers.get('content-disposition')?.includes('attachment'));await fetched.arrayBuffer();
 await request('/api/auth/logout',{method:'POST',cookie:userCookie,data:{}});await request('/api/favorites',{cookie:userCookie,expected:401});ok('Sign-out invalidates the session',true);
 await writeFile('test-results/integration.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));console.log('\n'+checks.length+' integration checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/integration.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,error:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
