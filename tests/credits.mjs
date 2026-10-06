// Credits suite: balances, welcome credits, admin adjustments, idempotency, concurrency, ledger invariants,
// credit packs, the demo test checkout and (in production mode with a fake Stripe) webhooks and chargebacks.
// Runs against the compiled Worker with disposable D1/R2 bindings, like the other suites.
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,randomUUID,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare}=require('miniflare');
const server=path.resolve('dist/server');
const moduleFiles=(await readdir(server,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const adminPassword=randomBytes(20).toString('hex');const salt=randomBytes(32).toString('hex');
const config={DEMO_MODE:'true',APP_ORIGIN:'http://studio.test',APP_SECRET:randomBytes(32).toString('hex'),QUEUE_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:'admin@studio.test',ADMIN_PASSWORD_HASH:'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(adminPassword,salt,100000,32,'sha256').toString('hex')};
const mf=new Miniflare({modules:moduleFiles.map(f=>({type:'ESModule',path:path.join(server,f)})),modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:config,d1Databases:{DB:'studio-credits'},r2Buckets:['BUCKET'],cf:false});
const checks=[];
function ok(name,value){assert(value,name);checks.push({name,passed:true});console.log('PASS',name)}
async function request(route,{method='GET',data,cookie,expected=200}={}){const headers={origin:config.APP_ORIGIN,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})};const response=await mf.dispatchFetch(config.APP_ORIGIN+route,{method,headers,body:data!==undefined?JSON.stringify(data):undefined});const text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}if(expected!==null)assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,350)}`);return {response,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
const register=async(email)=>request('/api/auth/register',{method:'POST',data:{name:'Credit Tester',email,password:'Test-password-123'},expected:201});

// Production mode with a fake Stripe: signed webhooks, wrong amounts, duplicates, chargebacks and expired sessions.
async function liveChecks(){
 const {Response:MFResponse}=require('miniflare');
 const keys={STRIPE_SECRET_KEY:'sk_test_'+randomBytes(20).toString('hex'),STRIPE_WEBHOOK_SECRET:'whsec_'+randomBytes(20).toString('hex'),FAL_KEY:'fal_'+randomBytes(20).toString('hex'),RESEND_API_KEY:'re_'+randomBytes(20).toString('hex'),MAIL_FROM:'hello@studio.test'};
 const env={...config,DEMO_MODE:'false',PUBLIC_SERVICE_ACCESS:'true',...keys};
 const sessions=new Map(),calls=[];let serial=0;
 const live=new Miniflare({modules:moduleFiles.map(f=>({type:'ESModule',path:path.join(server,f)})),modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:env,d1Databases:{DB:'studio-credits-live'},r2Buckets:['BUCKET'],cf:false,
  outboundService:async req=>{const url=new URL(req.url);
   if(url.hostname==='api.resend.com')return MFResponse.json({id:'email_fixture'});
   assert.equal(url.hostname,'api.stripe.com','Unexpected external call: '+url.hostname);
   if(url.pathname==='/v1/checkout/sessions'&&req.method==='POST'){const form=new URLSearchParams(await req.text());calls.push(form);const id='cs_live_'+(++serial);const session={id,url:'https://checkout.stripe.com/c/'+id,status:'open',payment_status:'unpaid',amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),currency:form.get('line_items[0][price_data][currency]'),payment_intent:'pi_'+id,metadata:{purchase_id:form.get('metadata[purchase_id]')}};sessions.set(id,session);return MFResponse.json(session);}
   if(url.pathname.startsWith('/v1/checkout/sessions/')&&req.method==='GET')return MFResponse.json(sessions.get(url.pathname.split('/').at(-1)));
   throw new Error('Unexpected Stripe call: '+url.pathname);}});
 const call=async(route,{method='GET',data,cookie,headers={},expected=200}={})=>{const r=await live.dispatchFetch(env.APP_ORIGIN+route,{method,headers:{origin:env.APP_ORIGIN,...(cookie?{cookie}:{}),...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data!==undefined?JSON.stringify(data):undefined});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}if(expected!==null)assert.equal(r.status,expected,`${method} ${route}: ${text.slice(0,300)}`);return {body,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const webhook=(type,object,expected=200)=>{const event={id:'evt_'+randomUUID(),type,data:{object}};const raw=JSON.stringify(event);const t=Math.floor(Date.now()/1000);return live.dispatchFetch(env.APP_ORIGIN+'/api/webhooks/stripe',{method:'POST',headers:{'content-type':'application/json','stripe-signature':'t='+t+',v1='+createHmac('sha256',keys.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex')},body:raw}).then(async r=>{assert.equal(r.status,expected,type+': '+await r.text());return r;});};
 try{
  const db=await live.getD1Database('DB');
  for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){for(const st of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(st).run();}
  await call('/api/health');
  const admin=(await call('/api/auth/login',{method:'POST',data:{email:'admin@studio.test',password:adminPassword}})).cookie;
  await call('/api/admin/providers/fal',{method:'PATCH',cookie:admin,data:{enabled:true}});
  await live.dispatchFetch(env.APP_ORIGIN+'/api/queue/dispatch',{method:'POST',headers:{authorization:'Bearer '+env.QUEUE_SECRET}});
  const pack=(await call('/api/admin/credit-packages',{method:'POST',cookie:admin,data:{name:'Starter',credits:500,prices:{EUR:499},active:true},expected:201})).body.package;
  const reg=await call('/api/auth/register',{method:'POST',data:{name:'Live Buyer',email:'live@credits.test',password:'Test-password-123'},expected:201});
  await call('/api/credits/checkout',{method:'POST',cookie:reg.cookie,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:403});
  ok('Live checkout requires a verified email',true);
  await db.prepare('UPDATE users SET email_verified=1 WHERE id=?').bind(reg.body.user.id).run();
  const buyer=reg.cookie,balance=async()=>(await call('/api/credits',{cookie:buyer})).body.available;
  const started=(await call('/api/credits/checkout',{method:'POST',cookie:buyer,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
  const form=calls.at(-1),session=[...sessions.values()].at(-1);
  ok('Stripe checkout uses the server price and routes the webhook by purchase',started.url===session.url&&form.get('metadata[purchase_id]')===started.purchaseId&&form.get('line_items[0][price_data][unit_amount]')==='499'&&form.get('line_items[0][price_data][currency]')==='eur'&&form.get('success_url').includes('/credits?purchase='+started.purchaseId));
  await webhook('checkout.session.completed',{...session,payment_status:'paid',status:'complete',amount_total:1},400);
  ok('A webhook with the wrong amount grants nothing',await balance()===0);
  const paidSession={...session,payment_status:'paid',status:'complete'};
  await Promise.all([webhook('checkout.session.completed',paidSession),webhook('checkout.session.completed',paidSession)]);
  await webhook('checkout.session.async_payment_succeeded',paidSession);
  ok('Duplicate and concurrent payment webhooks grant the pack once',await balance()===500);
  sessions.set(session.id,paidSession);await call(`/api/credits/purchases/${started.purchaseId}/verify`,{method:'POST',cookie:buyer,data:{}});
  ok('Verifying a returned checkout after the webhook changes nothing',await balance()===500);
  await call(`/api/admin/users/${reg.body.user.id}/credits`,{method:'POST',cookie:admin,data:{amount:-200,reason:'Simulated spending',currentPassword:adminPassword,idempotencyKey:randomUUID()}});
  await webhook('charge.dispute.created',{id:'dp_1',payment_intent:paidSession.payment_intent});
  await webhook('charge.dispute.created',{id:'dp_1',payment_intent:paidSession.payment_intent});
  ok('A chargeback removes the purchased credits once, even below zero',await balance()===-200&&(await call('/api/credits/purchases/'+started.purchaseId,{cookie:buyer})).body.purchase.status==='reversed');
  await webhook('checkout.session.completed',paidSession);
  ok('A late payment webhook cannot grant a reversed purchase again',await balance()===-200);
  const rec=(await call('/api/admin/credits/reconciliation',{cookie:admin})).body;
  ok('The ledger still reconciles and lists the negative balance',rec.ok&&rec.negative.length===1);
  ok('Operations reports the account below zero',(await call('/api/admin/operations',{cookie:admin})).body.checks.some(c=>c.name==='Credit ledger'&&c.detail.includes('below zero')));
  // An expired session is replaced on retry.
  const second=(await call('/api/credits/checkout',{method:'POST',cookie:buyer,data:{packageId:pack.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},expected:201})).body;
  const old=[...sessions.values()].at(-1);
  await webhook('checkout.session.expired',{...old,status:'expired'});sessions.set(old.id,{...old,status:'expired'});
  ok('An expired checkout marks the purchase failed',(await call('/api/credits/purchases/'+second.purchaseId,{cookie:buyer})).body.purchase.status==='failed');
  const retried=(await call(`/api/credits/purchases/${second.purchaseId}/retry`,{method:'POST',cookie:buyer,data:{}})).body;
  ok('Retrying an expired checkout opens a new Stripe session',retried.url!==old.url&&retried.url===[...sessions.values()].at(-1).url&&(await call('/api/credits/purchases/'+second.purchaseId,{cookie:buyer})).body.purchase.status==='pending');
  await call(`/api/credits/purchases/${second.purchaseId}/pay`,{method:'POST',cookie:buyer,data:{result:'success'},expected:403});
  ok('The test payment endpoint is disabled in production',await balance()===-200);
 }finally{await live.dispose()}
}
try{
 const db=await mf.getD1Database('DB');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){for(const s of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();}
 const zeroSum=async()=>Number((await db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM credit_entries').first()).total)===0;

 const formula=(await request('/api/templates')).body.templates.find(t=>t.slug==='formula-driver');
 ok('Templates expose a credit cost',formula.creditCost===299);

 const admin=(await request('/api/auth/login',{method:'POST',data:{email:'admin@studio.test',password:adminPassword}})).cookie;
 const first=await register('first@credits.test');const user=first.cookie,userId=first.body.user.id;
 ok('A new account starts with zero credits by default',JSON.stringify((await request('/api/credits',{cookie:user})).body)===JSON.stringify({available:0,held:0}));

 // Welcome credits are an admin setting.
 await request('/api/admin/settings',{method:'PATCH',cookie:admin,data:{welcomeCredits:50}});
 ok('Admin settings report welcome credits',(await request('/api/admin/settings',{cookie:admin})).body.welcomeCredits===50);
 const second=await register('second@credits.test');
 const welcomed=(await request('/api/credits/history',{cookie:second.cookie})).body;
 ok('Verified new accounts receive the configured welcome credits',(await request('/api/credits',{cookie:second.cookie})).body.available===50&&welcomed.transactions[0].kind==='welcome'&&welcomed.transactions[0].available_change===50);
 await request('/api/admin/settings',{method:'PATCH',cookie:admin,data:{welcomeCredits:0}});
 ok('Welcome credits can be turned back off',(await request('/api/credits',{cookie:(await register('third@credits.test')).cookie})).body.available===0);
 await request('/api/admin/settings',{method:'PATCH',cookie:admin,data:{welcomeCredits:-5},expected:400});ok('Negative welcome credits are rejected',true);

 // Admin adjustments need the admin role, the admin password and a reason.
 const adjust=(amount,{key=randomUUID(),password=adminPassword,expected=200,reason='Support gift'}={})=>request(`/api/admin/users/${userId}/credits`,{method:'POST',cookie:admin,data:{amount,reason,currentPassword:password,idempotencyKey:key},expected});
 await request(`/api/admin/users/${userId}/credits`,{method:'POST',cookie:user,data:{amount:500,reason:'Self gift',currentPassword:'Test-password-123',idempotencyKey:randomUUID()},expected:403});
 ok('Customers cannot grant themselves credits',(await request('/api/credits',{cookie:user})).body.available===0);
 await adjust(100,{password:'wrong-password',expected:403});ok('Adjustments require the administrator password',true);
 await adjust(100,{reason:'',expected:400});ok('Adjustments require a reason',true);
 const gift=await adjust(250);
 ok('Admin can add credits with a reason',gift.body.applied&&gift.body.available===250);
 await adjust(-300,{expected:402});ok('A removal cannot take the balance below zero',(await request('/api/credits',{cookie:user})).body.available===250);

 // Idempotency: the same key applies once, even when sent twice at the same time.
 const key=randomUUID();const [a,b]=await Promise.all([adjust(10,{key}),adjust(10,{key})]);
 ok('A repeated adjustment key applies exactly once',[a,b].filter(r=>r.body.applied).length===1&&[a,b].some(r=>r.body.duplicate)&&(await request('/api/credits',{cookie:user})).body.available===260);

 // Concurrency: five simultaneous removals of 100 from 260 credits; only two can succeed.
 const results=await Promise.all(Array.from({length:5},()=>adjust(-100,{expected:null})));
 const applied=results.filter(r=>r.response.status===200&&r.body.applied).length,refused=results.filter(r=>r.response.status===402).length;
 ok('Simultaneous spending never overdraws the balance',applied===2&&refused===3&&(await request('/api/credits',{cookie:user})).body.available===60);

 const history=(await request('/api/credits/history',{cookie:user})).body;
 ok('History lists every applied change with the resulting balance',history.pagination.total===4&&history.transactions[0].available_after===60&&history.transactions.every(t=>t.kind==='adjust'));
 const adminView=(await request(`/api/admin/users/${userId}/credits`,{cookie:admin})).body;
 ok('Admin sees a user balance and history',adminView.balance.available===60&&adminView.transactions.length===4);
 const ledger=(await request('/api/admin/credits/ledger?kind=adjust&search=first%40credits.test',{cookie:admin})).body;
 ok('Admin ledger filters by type and customer',ledger.pagination.total===4&&ledger.transactions.every(t=>t.email==='first@credits.test'));
 await request('/api/admin/credits/ledger',{cookie:user,expected:403});ok('Customers cannot read the ledger',true);
 ok('Every adjustment is in the audit log',Number((await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='credits.adjust' AND target_id=?").bind(userId).first()).n)===4);

 // Ledger invariants.
 ok('All ledger entries sum to zero',await zeroSum());
 const reconciliation=(await request('/api/admin/credits/reconciliation',{cookie:admin})).body;
 ok('Reconciliation finds balances equal to the ledger',reconciliation.ok&&reconciliation.mismatched.length===0);
 ok('Operations shows the credit ledger check',(await request('/api/admin/operations',{cookie:admin})).body.checks.some(c=>c.name==='Credit ledger'&&c.ready));
 await db.prepare('UPDATE credit_balances SET available=available+1 WHERE user_id=?').bind(userId).run();
 ok('Reconciliation detects a balance edited outside the ledger',!(await request('/api/admin/credits/reconciliation',{cookie:admin})).body.ok);
 await db.prepare('UPDATE credit_balances SET available=available-1 WHERE user_id=?').bind(userId).run();
 let rejected=false;try{await db.prepare("INSERT INTO credit_transactions (id,kind,idempotency_key,user_id,created_at) VALUES ('x','adjust','adjust:'||?,?,0)").bind(key,userId).run()}catch{rejected=true}
 ok('The database refuses a second transaction with the same idempotency key',rejected);


 // Credit packs (demo mode uses the test checkout).
 const pack=(data,expected=201,cookie=admin)=>request('/api/admin/credit-packages',{method:'POST',cookie,data,expected});
 await pack({name:'No price',credits:100,prices:{},active:true},400);ok('A pack needs at least one price',true);
 await pack({name:'Sneaky',credits:100,prices:{EUR:99},active:true},403,user);ok('Customers cannot create packs',true);
 const starter=(await pack({name:'Starter',credits:500,bonusCredits:0,prices:{EUR:499,USD:549},active:true,sortOrder:1})).body.package;
 const value=(await pack({name:'Value',credits:1000,bonusCredits:100,prices:{EUR:999},active:true,sortOrder:2})).body.package;
 const hidden=(await pack({name:'Hidden',credits:50,prices:{EUR:99},active:false})).body.package;
 const shop=(await request('/api/credit-packages')).body.packages;
 ok('The public pack list shows active packs in order with their total credits',shop.map(p=>p.name).join()==='Starter,Value'&&shop[1].totalCredits===1100&&!JSON.stringify(shop).includes(hidden.id));
 await request('/api/admin/credit-packages/'+hidden.id,{method:'PATCH',cookie:admin,data:{...hidden,name:'Hidden pack',active:false}});
 await request('/api/admin/credit-packages/'+hidden.id,{method:'DELETE',cookie:admin});
 ok('Admin edits and removes packs',!(await request('/api/admin/credit-packages',{cookie:admin})).body.packages.some(p=>p.id===hidden.id));
 const buyer=await register('buyer@credits.test');const buy=(data,expected=201)=>request('/api/credits/checkout',{method:'POST',cookie:buyer.cookie,data,expected});
 await buy({packageId:value.id,currency:'EUR',idempotencyKey:randomUUID()},400);ok('Checkout requires consent to immediate delivery',true);
 await buy({packageId:value.id,currency:'USD',idempotencyKey:randomUUID(),consent:true},400);ok('A pack is sold only in its configured currencies',true);
 await buy({packageId:hidden.id,currency:'EUR',idempotencyKey:randomUUID(),consent:true},404);ok('Removed packs cannot be bought',true);
 const buyKey=randomUUID();const started=(await buy({packageId:value.id,currency:'EUR',idempotencyKey:buyKey,consent:true})).body;
 ok('Demo checkout opens the test payment page',started.url==='/credits/checkout/'+started.purchaseId);
 ok('Retrying checkout with the same key returns the same purchase',(await buy({packageId:value.id,currency:'EUR',idempotencyKey:buyKey,consent:true})).body.purchaseId===started.purchaseId);
 await buy({packageId:starter.id,currency:'EUR',idempotencyKey:buyKey,consent:true},409);ok('A checkout key cannot be reused for another pack',true);
 const pay=(result,expected=200)=>request(`/api/credits/purchases/${started.purchaseId}/pay`,{method:'POST',cookie:buyer.cookie,data:{result},expected});
 await pay('fail',402);
 ok('A declined test payment grants nothing',(await request('/api/credits',{cookie:buyer.cookie})).body.available===0&&(await request('/api/credits/purchases/'+started.purchaseId,{cookie:buyer.cookie})).body.purchase.status==='failed');
 const paid=(await pay('success')).body;
 ok('A successful payment grants the pack credits plus bonus',paid.purchase.status==='paid'&&paid.balance.available===1100);
 await Promise.all([pay('success'),pay('success')]);
 ok('Paying again never grants twice',(await request('/api/credits',{cookie:buyer.cookie})).body.available===1100);
 const bought=(await request('/api/credits/history',{cookie:buyer.cookie})).body.transactions;
 ok('The purchase appears in the credit history',bought.length===1&&bought[0].kind==='purchase'&&bought[0].reason==='Value'&&bought[0].available_change===1100);
 ok('Customers see their purchases; admins see everyone’s',(await request('/api/credits/purchases',{cookie:buyer.cookie})).body.purchases.length===1&&(await request('/api/admin/credits/purchases',{cookie:admin})).body.purchases.some(p=>p.email==='buyer@credits.test'));
 await request('/api/credits/purchases/'+started.purchaseId,{cookie:user,expected:404});ok('A purchase is private to its buyer',true);
 const exported=(await request('/api/account/export',{cookie:user})).body;
 ok('Account export includes the credit balance and history',exported.credits.available===60&&exported.credits.transactions.length===4);
 await request('/api/admin/users/'+userId,{method:'DELETE',cookie:admin});
 ok('Deleting an account keeps its ledger history',!await db.prepare('SELECT 1 FROM credit_balances WHERE user_id=?').bind(userId).first()&&Number((await db.prepare('SELECT COUNT(*) AS n FROM credit_transactions WHERE user_id=?').bind(userId).first()).n)===4&&await zeroSum());

 await liveChecks();
 await mkdir('test-results',{recursive:true});await writeFile('test-results/credits.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));console.log('\n'+checks.length+' credit checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/credits.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,failed:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
