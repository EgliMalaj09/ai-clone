// Credits ledger suite: balances, welcome credits, admin adjustments, idempotency, concurrency and ledger invariants.
// Runs against the compiled Worker with disposable D1/R2 bindings, like the other suites.
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,pbkdf2Sync,randomUUID} from 'node:crypto';
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

 const exported=(await request('/api/account/export',{cookie:user})).body;
 ok('Account export includes the credit balance and history',exported.credits.available===60&&exported.credits.transactions.length===4);
 await request('/api/admin/users/'+userId,{method:'DELETE',cookie:admin});
 ok('Deleting an account keeps its ledger history',!await db.prepare('SELECT 1 FROM credit_balances WHERE user_id=?').bind(userId).first()&&Number((await db.prepare('SELECT COUNT(*) AS n FROM credit_transactions WHERE user_id=?').bind(userId).first()).n)===4&&await zeroSum());

 await mkdir('test-results',{recursive:true});await writeFile('test-results/credits.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));console.log('\n'+checks.length+' credit checks passed.');
}catch(e){console.error('FAIL',e);await mkdir('test-results',{recursive:true});await writeFile('test-results/credits.json',JSON.stringify({date:new Date().toISOString(),passed:checks.length,failed:String(e),checks},null,2));process.exitCode=1}finally{await mf.dispose()}
