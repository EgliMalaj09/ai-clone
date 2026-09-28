import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,createHash,createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,Response:MFResponse}=require('miniflare');
const server=path.resolve('dist/server');
const modules=(await readdir(server,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b)).map(f=>({type:'ESModule',path:path.join(server,f)}));
const adminPassword=randomBytes(18).toString('hex'),salt=randomBytes(32).toString('hex');
const config={DEMO_MODE:'true',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),QUEUE_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(adminPassword,salt,100000,32,'sha256').toString('hex'),STRIPE_WEBHOOK_SECRET:'whsec_disposable',STRIPE_SECRET_KEY:'sk_test_fixture_only',AUTO_REFUND:'true'};
const sessions=new Map(),idempotency=new Map();let stripeSessions=0;
const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:config,d1Databases:{DB:'security-tests'},r2Buckets:['BUCKET'],cf:false,
 outboundService:async req=>{
  const url=new URL(req.url);
  assert.equal(url.hostname,'api.stripe.com','External network is blocked in this suite');
  if(url.pathname==='/v1/checkout/sessions'&&req.method==='POST'){
   const key=req.headers.get('idempotency-key');if(idempotency.has(key))return MFResponse.json(idempotency.get(key));
   const form=new URLSearchParams(await req.text());const id='cs_fixture_'+(++stripeSessions);
   const session={id,url:'https://checkout.stripe.com/c/test/'+id,status:'open',payment_status:'unpaid',amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),currency:form.get('line_items[0][price_data][currency]')};
   sessions.set(id,session);idempotency.set(key,session);return MFResponse.json(session);
  }
  if(url.pathname.startsWith('/v1/checkout/sessions/')&&req.method==='GET'){
   const s=sessions.get(url.pathname.split('/').at(-1));assert(s,'Unknown fixture checkout');return MFResponse.json(s);
  }
  throw new Error('Unexpected provider call: '+url.pathname);
 }
});
const checks=[];const hash=s=>createHash('sha256').update(s).digest('hex');
const ok=(name,value=true)=>{assert(value,name);checks.push({name,passed:true});console.log('PASS',name)};
async function request(route,{method='GET',data,cookie,headers={},expected=200,origin=true}={}){
 const h={...(origin?{origin:config.APP_ORIGIN}:{}),...(cookie?{cookie}:{}),...(data!==undefined?{'content-type':'application/json'}:{}),...headers};
 const r=await mf.dispatchFetch(config.APP_ORIGIN+route,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
 if(expected!==null)assert.equal(r.status,expected,method+' '+route+': '+text.slice(0,250));
 return {body,text,response:r,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function webhook(event,expected=200){const t=Math.floor(Date.now()/1000);return request('/api/webhooks/stripe',{method:'POST',data:event,headers:{'stripe-signature':'t='+t+',v1='+createHmac('sha256',config.STRIPE_WEBHOOK_SECRET).update(t+'.'+JSON.stringify(event)).digest('hex')},expected});}
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const s of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await request('/api/health');
 const admin=(await request('/api/auth/login',{method:'POST',data:{email:config.ADMIN_EMAIL,password:adminPassword}})).cookie;
 const forgot=await request('/api/auth/forgot',{method:'POST',data:{email:config.ADMIN_EMAIL}});
 const unknown=await request('/api/auth/forgot',{method:'POST',data:{email:'unknown@studio.test'}});
 ok('Demo recovery never exposes a reset link or reveals account existence',forgot.text===unknown.text&&!forgot.text.includes('testLink')&&!forgot.text.includes('token='));
 ok('Demo reset request does not mint a usable token',(await db.prepare('SELECT COUNT(*) AS n FROM auth_tokens').first()).n===0);
 const user=await request('/api/auth/register',{method:'POST',data:{name:'Security QA',email:'qa@studio.test',password:'Initial-password-123'},expected:201});let cookie=user.cookie;
 const other=(await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Initial-password-123'}})).cookie;
 const active=await request('/api/account/sessions',{cookie});ok('Session list identifies the current browser without token hashes',active.body.sessions.length===2&&active.body.sessions.filter(s=>s.current).length===1&&!active.text.includes('token_hash'));
 await request('/api/account/sessions',{method:'DELETE',cookie});ok('Revoke other sessions preserves this session',(await request('/api/me',{cookie})).body.user.id===user.body.user.id&&(await request('/api/me',{cookie:other})).body.user===null);
 await request('/api/account/password',{method:'POST',cookie,data:{currentPassword:'wrong-password',newPassword:'Secure-new-password-123'},expected:403});ok('Changing password requires the current password');
 const change=await request('/api/account/password',{method:'POST',cookie,data:{currentPassword:'Initial-password-123',newPassword:'Secure-new-password-123'}});
 ok('Password change rotates the session and invalidates the old one',change.cookie!==cookie&&(await request('/api/me',{cookie})).body.user===null);cookie=change.cookie;
 await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:'Initial-password-123'},expected:401});ok('Previous password no longer signs in');
 const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_tokens (token_hash,user_id,type,expires_at) VALUES (?,?,?,?)').bind(hash(token),user.body.user.id,'reset',Date.now()+600000).run();
 await request('/api/auth/reset',{method:'POST',data:{token,password:'short'},expected:400});ok('Invalid reset payload does not consume the token',!!await db.prepare('SELECT token_hash FROM auth_tokens WHERE token_hash=?').bind(hash(token)).first());
 const resets=await Promise.all([request('/api/auth/reset',{method:'POST',data:{token,password:'Reset-password-123'},expected:null}),request('/api/auth/reset',{method:'POST',data:{token,password:'Reset-password-456'},expected:null})]);
 ok('A reset token can be consumed only once under concurrency',resets.map(r=>r.response.status).sort().join(',')==='200,400');
 const winningPassword=resets[0].response.status===200?'Reset-password-123':'Reset-password-456';
 ok('Reset revokes previous sessions',(await request('/api/me',{cookie})).body.user===null);cookie=(await request('/api/auth/login',{method:'POST',data:{email:'qa@studio.test',password:winningPassword}})).cookie;
 await request('/api/account',{method:'PATCH',cookie,origin:false,data:{name:'Cross-site'},expected:403});ok('Authenticated mutation without an Origin is rejected');
 await request('/api/account',{method:'PATCH',cookie,data:{name:'X'.repeat(1_000_001)},expected:413});ok('Large JSON requests are rejected before parsing');
 await request('/api/admin/operations',{cookie,expected:403});await request('/api/admin/activity',{expected:401});ok('Operations and audit endpoints enforce the admin role');
 const ops=await request('/api/admin/operations',{cookie:admin});ok('Readiness shows absent live services without exposing secrets',ops.body.checks.length===7&&!ops.text.includes(config.APP_SECRET)&&!ops.text.includes(config.STRIPE_SECRET_KEY));
 const page=await request('/api/admin/users?limit=1&page=2',{cookie:admin});ok('Admin records support server pagination',page.body.users.length===1&&page.body.pagination.total===2&&page.body.pagination.page===2);
 const search=await request('/api/admin/users?search=qa%40studio.test',{cookie:admin});ok('Admin search filters on the server',search.body.users.length===1&&search.body.users[0].email==='qa@studio.test');
 await request('/api/admin/users?page=-1',{cookie:admin,expected:400});ok('Pagination parameters are validated');
 const catalog=await request('/api/templates?q=formula&category=Sports&tag=trending&sort=price-low');ok('Public catalog search, category, tag, and sort API work',catalog.body.templates.length===1&&catalog.body.templates[0].slug==='formula-driver');
 await request('/api/templates?sort=constructor',{expected:400});await request('/api/templates/missing',{expected:404});ok('Catalog rejects unknown sorting and missing detail IDs');
 for(const route of ['/explore/extra','/checkout','/share','/admin/nonsense'])await request(route,{expected:404});ok('Malformed page routes return 404');
 const formula=(await request('/api/admin/templates/tpl_formula-driver',{cookie:admin})).body.template;
 const broken={...formula,workflow:[{...formula.workflow[0],inputs:{image:'{{previous_output}}'}}]};
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:admin,data:broken,expected:400});ok('Workflow rejects forward references before charging customers');
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:admin,data:{...formula,workflow:[{...formula.workflow[0],output:'__proto__'}]},expected:400});ok('Reserved workflow variable names are rejected');
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:admin,data:{...formula,thumbnail:'/media/not-a-real-preview.webp'},expected:400});ok('Templates cannot publish broken bundled preview paths');
 const uploadId='up_security_fixture',storageKey='uploads/security-test/photo';const bytes=await readFile('public/media/formula-driver.webp');await bucket.put(storageKey,bytes);
 await db.prepare('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,public,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(uploadId,user.body.user.id,storageKey,'image/webp',bytes.length,'photo.webp',0,Date.now()).run();
 await request('/api/admin/templates/'+formula.id,{method:'PATCH',cookie:admin,data:{...formula,thumbnail:'/api/media/'+uploadId},expected:400});ok('Admin preview fields cannot expose private user uploads');
 const key=randomUUID();const checkout=await request('/api/checkout',{method:'POST',cookie,data:{templateId:formula.id,expectedPrice:299,uploadIds:[uploadId],consent:true,idempotencyKey:key},expected:201});
 const {orderId,generationId}=checkout.body;const pay=await db.prepare('SELECT * FROM payments WHERE order_id=?').bind(orderId).first();
 await request('/api/orders/'+orderId+'/pay',{method:'POST',cookie,data:{result:'unexpected'},expected:400});ok('Test payment only accepts explicit success or failure');
 sessions.set('cs_expired',{id:'cs_expired',status:'expired',payment_status:'unpaid'});await db.prepare("UPDATE payments SET provider='stripe',provider_session_id='cs_expired',checkout_url='https://checkout.stripe.com/c/expired' WHERE id=?").bind(pay.id).run();
 const retries=await Promise.all([request('/api/orders/'+orderId+'/retry',{method:'POST',cookie,data:{}}),request('/api/orders/'+orderId+'/retry',{method:'POST',cookie,data:{}})]);
 const fresh=await db.prepare('SELECT * FROM payments WHERE id=?').bind(pay.id).first();
 ok('Expired checkout renews once even under concurrent retries',stripeSessions===1&&fresh.checkout_attempt===1&&retries[0].body.id===retries[1].body.id);
 await webhook({id:'evt_expired_old',type:'checkout.session.expired',data:{object:{id:'cs_expired',metadata:{order_id:orderId}}}});
 ok('Delayed expiry event cannot fail a newer checkout',(await request('/api/orders/'+orderId,{cookie})).body.order.status==='pending');
 const waiting=sessions.get(fresh.provider_session_id);waiting.status='complete';
 await request('/api/orders/'+orderId+'/retry',{method:'POST',cookie,data:{},expected:409});ok('A pending asynchronous payment cannot open a second checkout',stripeSessions===1);
 const paid={id:'evt_paid_fixture',type:'checkout.session.completed',data:{object:{id:fresh.provider_session_id,payment_status:'paid',payment_intent:'pi_security_fixture',amount_total:299,currency:'usd',metadata:{order_id:orderId}}}};
 await webhook({...paid,id:'evt_bad_amount',data:{object:{...paid.data.object,amount_total:1}}},400);ok('Stripe webhook rejects amount tampering');
 await webhook(paid);await webhook(paid);ok('Signed confirmation is idempotent',(await db.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE id=?").bind(paid.id).first()).n===1);
 await webhook({id:'evt_refunded',type:'charge.refunded',data:{object:{payment_intent:'pi_security_fixture',refunded:true,refunds:{data:[{id:'re_external'}]}}}});
 const stopped=await db.prepare('SELECT status,lease_token FROM generations WHERE id=?').bind(generationId).first();
 ok('External refund stops active work and invalidates its lease',stopped.status==='failed'&&stopped.lease_token===null);
 ok('External refund is retained for financial reconciliation',(await db.prepare('SELECT status FROM refunds WHERE payment_id=?').bind(pay.id).first()).status==='succeeded');
 await webhook({...paid,id:'evt_paid_late'});ok('Late payment event cannot restart a refunded generation',(await db.prepare('SELECT status FROM generations WHERE id=?').bind(generationId).first()).status==='failed');
 await request('/api/admin/settings',{method:'PATCH',cookie:admin,data:{autoRefund:false}});
 const timeoutOrder=await request('/api/checkout',{method:'POST',cookie,data:{templateId:formula.id,expectedPrice:299,uploadIds:[uploadId],consent:true,idempotencyKey:randomUUID()},expected:201});
 await db.prepare("UPDATE orders SET status='paid' WHERE id=?").bind(timeoutOrder.body.orderId).run();await db.prepare("UPDATE payments SET status='paid',provider_transaction_id='test_timeout' WHERE order_id=?").bind(timeoutOrder.body.orderId).run();await db.prepare("UPDATE generations SET status='generating',started_at=? WHERE id=?").bind(Date.now()-31*60000,timeoutOrder.body.generationId).run();
 await request('/api/queue/dispatch',{method:'POST',data:{},expected:401});
 await request('/api/queue/dispatch',{method:'POST',headers:{authorization:'Bearer '+config.QUEUE_SECRET},data:{}});
 ok('Queue enforces the deadline',(await db.prepare('SELECT status FROM generations WHERE id=?').bind(timeoutOrder.body.generationId).first()).status==='failed');
 ok('Admin can disable automatic refunds even if the environment default is on',(await request('/api/orders/'+timeoutOrder.body.orderId,{cookie})).body.order.status==='paid');
 const currentOps=await request('/api/admin/operations',{cookie:admin});ok('External queue dispatch records an observable heartbeat',currentOps.body.dispatchHeartbeat>0&&currentOps.body.checks.find(c=>c.name==='External queue dispatcher').ready);
 await request('/api/admin/orders/'+timeoutOrder.body.orderId+'/refund',{method:'POST',cookie:admin,data:{}});ok('Admin refund remains available with automatic refunds disabled',(await request('/api/orders/'+timeoutOrder.body.orderId,{cookie})).body.order.status==='refunded');
 const dashboard=await request('/api/admin/dashboard',{cookie:admin});ok('Estimated cost of refunded jobs remains in financial reports',dashboard.body.financials[0].estimated_cost>=85&&dashboard.body.financials[0].refunded_amount===598);
 const exported=await request('/api/account/export',{cookie});ok('Account export includes owned records without internal workflow or password data',exported.body.orders.length===2&&!exported.text.includes('password_hash')&&!exported.text.includes('workflow_snapshot')&&!exported.text.includes('storage_key'));
 const activity=await request('/api/admin/activity?search=account.password-changed',{cookie:admin});ok('Security actions are recorded in the searchable audit log',activity.body.activity.length===1);
 await request('/api/account',{method:'DELETE',cookie,data:{password:'wrong'},expected:403});ok('Deleting an account requires reauthentication');
 await request('/api/account',{method:'DELETE',cookie,data:{password:winningPassword}});ok('Account deletion removes storage and identity',await bucket.get(storageKey)===null&&!await db.prepare('SELECT id FROM users WHERE id=?').bind(user.body.user.id).first());
 await request('/api/admin/users/'+(await request('/api/me',{cookie:admin})).body.user.id,{method:'PATCH',cookie:admin,data:{status:'suspended'},expected:409});ok('Admin cannot accidentally suspend the administrator account');
 const html=await request('/admin/operations',{cookie:admin});ok('Authenticated admin operations page renders',html.text.includes('Keep everything moving')||html.text.includes('Workspace'));
 const headers=(await request('/')).response.headers;ok('Security response headers are present',headers.get('content-security-policy')?.includes("object-src 'none'")&&headers.get('x-content-type-options')==='nosniff');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/security-regressions.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,network:'Stripe responses simulated locally; no external payments or messages sent',checks},null,2));console.log('\n'+checks.length+' security and operational checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/security-regressions.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,error:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
