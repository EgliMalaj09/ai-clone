import {liveWorkflow} from './workflow-presets';
import {assertGeneratable,connectionStatus,publicAvailability,serviceConfig,updateConnections} from './connections';
import {ZodError,z} from 'zod';
import {jsonBody,pageQuery,readUploadedFile} from './http';
import {creditValues,deletePackage,ensurePackCheckout,listPackages,listPurchases,payTestPurchase,publicPurchase,purchaseFor,reversePackPayment,savePackage,startPackCheckout,verifyPackCheckout} from './credit-purchases';
import {adjust,balanceOf,creditHistory,creditLedger,grantWelcomeCredits,onlyIfApplied,placeHold,reconcileCredits} from './credits';
import {deleteTemplateMedia,listTemplateMedia,releaseTemplateMedia,templateMediaUrls,uploadTemplateMedia} from './template-media';
import {queryCatalog} from './catalog-query';
import {validateTemplateMedia} from './validation';
import {operationsSummary,adminActivity,accountSecurity,adminRecords} from './operations';
import {all,audit,batch,config,ensureSeed,event,getAdminTemplate,HttpError,must,now,one,parse,publicTemplate,run,stmt,templateStatements,uid,type Row} from './data';
import {authSchema,generationSchema,templateSchema} from './validation';
import {checkPassword,clearCookie,constantEqual,getUser,hash,makeAuthToken,passwordHash,protectOrigin,rateLimit,requireUser,safeUser,sendAuthMail,sessionCookie} from './security';
import {imageMime,mediaUrl,storage,validSignature} from './storage';
import {pokWebhook} from './payments';
import {removeGeneration,tickQueue} from './queue';
import type {AdminTemplate,StudioUser} from '../contracts';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers}});
const body=jsonBody;
const generationPublic=(g:Row)=>({id:g.id,templateName:g.template_name,templateSlug:g.template_slug,thumbnail:g.thumbnail,status:g.status,creditCost:g.credit_cost,creditStatus:g.credit_status??null,createdAt:g.created_at,startedAt:g.started_at,completedAt:g.completed_at,error:g.error,assetId:g.asset_id});
async function generationsFor(userId:string,url:URL,id?:string){
 const {page,limit,offset}=pageQuery(url,24),status=url.searchParams.get('status')||'all';
 const conditions=['g.user_id=?','g.deleted_at IS NULL'],args:unknown[]=[userId];
 if(id){conditions.push('g.id=?');args.push(id);}
 if(status==='processing')conditions.push("g.status IN ('queued','preparing','generating','finalizing')");
 else if(status!=='all'){must(['completed','failed'].includes(status),'Unknown creation status.');conditions.push('g.status=?');args.push(status);}
 const where=' WHERE '+conditions.join(' AND ');
 const count=await one('SELECT COUNT(*) AS total FROM generations g'+where,...args);
 const rows=await all("SELECT g.*,a.id AS asset_id,h.status AS credit_status FROM generations g LEFT JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output' LEFT JOIN credit_holds h ON h.id=g.hold_id"+where+' ORDER BY g.created_at DESC,g.id LIMIT ? OFFSET ?',...args,limit,offset);
 if(id)must(rows.length,'Creation not found.',404);
 // Counted independently of the status filter so the client knows whether to keep polling.
 const active=await one("SELECT COUNT(*) AS total FROM generations WHERE user_id=? AND deleted_at IS NULL AND status IN ('queued','preparing','generating','finalizing')",userId);
 return {generations:rows.map(generationPublic),activeCount:active?.total||0,pagination:{page,limit,total:count?.total||0,pages:Math.max(1,Math.ceil((count?.total||0)/limit))}};
}
async function deleteAccount(user:StudioUser){must(user.role!=='admin','An administrator cannot delete their own account here.',409);must(!await one("SELECT id FROM generations WHERE user_id=? AND status IN ('queued','preparing','generating','finalizing') LIMIT 1",user.id),'Wait for active generations to finish before deleting your account.',409);const objects=await all('SELECT storage_key FROM user_uploads WHERE user_id=? UNION ALL SELECT storage_key FROM generated_assets WHERE user_id=?',user.id,user.id);for(const o of objects)await storage.delete(o.storage_key);await batch([stmt("UPDATE generations SET deleted_at=?,input_ids='[]',context='{}' WHERE user_id=?",now(),user.id),stmt('DELETE FROM analytics_events WHERE user_id=?',user.id),stmt('DELETE FROM users WHERE id=?',user.id)]);}

/** Starts a creation by reserving its credits; the queue charges them on delivery and returns them on failure. */
async function startGeneration(user:StudioUser,input:unknown){
 must(user.emailVerified,'Verify your email before creating a video.',403);
 const b=generationSchema.parse(input);
 const key=`generate:${user.id}:${b.idempotencyKey}`;
 const repeat=async()=>{const prior=await one('SELECT reference_id FROM credit_transactions WHERE idempotency_key=?',key);if(!prior)return null;const g=await one('SELECT id,template_id,input_ids FROM generations WHERE id=?',prior.reference_id);
  must(g&&g.template_id===b.templateId&&JSON.stringify(parse(g.input_ids,[]))===JSON.stringify(b.uploadIds),'This request key was already used for another creation.',409);return {generationId:g.id as string,balance:await balanceOf(user.id)};};
 const prior=await repeat();if(prior)return prior;
 const t=await getAdminTemplate(b.templateId);must(t?.active,'This template is currently unavailable.',404);
 must(t.creditCost>0,'This template is not available yet.',409);
 must(t.creditCost===b.expectedCost,'This template’s credit cost changed. Refresh to review it.',409);
 must(b.uploadIds.length===t.requiredImageCount&&new Set(b.uploadIds).size===b.uploadIds.length,`Upload ${t.requiredImageCount} different photo${t.requiredImageCount>1?'s':''}.`);
 for(const id of b.uploadIds)must(await one('SELECT id FROM user_uploads WHERE id=? AND user_id=?',id,user.id),'An uploaded photo is unavailable or belongs to another account.',403);
 await assertGeneratable(t);
 const balance=await balanceOf(user.id);must(balance.available>=t.creditCost,`You need ${t.creditCost} credits for this video and have ${balance.available}.`,402);
 const generationId=uid('gen_'),created=now();
 const snapshot={name:t.name,slug:t.slug,aspectRatio:t.aspectRatio,duration:t.duration,steps:t.workflow.map(s=>({...s,prompt:s.prompt||t.hiddenPrompt,negativePrompt:s.negativePrompt||t.negativePrompt,settings:{...t.settings,...s.settings}}))};
 const hold=await placeHold({userId:user.id,amount:t.creditCost,generationId,key,extra:(holdId,tx)=>{const g=onlyIfApplied(tx);return [stmt(`INSERT INTO generations (id,user_id,template_id,template_name,template_slug,thumbnail,status,currency,estimated_cost,credit_cost,hold_id,workflow_snapshot,input_ids,next_run_at,created_at) SELECT ?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,? WHERE ${g.sql}`,
  generationId,user.id,t.id,t.name,t.slug,t.thumbnail,t.currency,t.estimatedCost,t.creditCost,holdId,JSON.stringify(snapshot),JSON.stringify(b.uploadIds),created,created,...g.args)];}});
 if(!hold.applied){const again=await repeat();must(again,'This creation could not be started. Please try again.',409);return again;}
 await event('generation_requested',user.id,{generationId,credits:t.creditCost});
 return {generationId,balance:{available:hold.available,held:hold.held}};
}

export async function handleAPI(req:Request){try{
 const url=new URL(req.url);const p=url.pathname.slice(5).split('/').filter(Boolean);const method=req.method;
 await ensureSeed();
 if(p.join('/')==='webhooks/pok'&&method==='POST'){const purchase=await pokWebhook(req);if(purchase)await verifyPackCheckout(purchase);return json({received:true});}
 protectOrigin(req);
 if(p.join('/')==='queue/dispatch'&&method==='POST'){must(config().cronSecret&&constantEqual(req.headers.get('authorization')||'','Bearer '+config().cronSecret),'Unauthorized queue worker.',401);const processed=await tickQueue();await run("INSERT INTO app_settings (key,value) VALUES ('queue_dispatch_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(now()));return json({processed});}
 const ip=req.headers.get('cf-connecting-ip')||'local';
 if(p.join('/')==='health'&&method==='GET')return json({status:'ok',demo:config().demo});
 if(p[0]==='templates'&&method==='GET'&&p.length<=2)return json(await queryCatalog(url,p[1]));
 if(p.join('/')==='credit-packages'&&method==='GET')return json({packages:await listPackages()});
 if(p[0]==='me'&&method==='GET')return json({user:await getUser(req.headers),demo:config().demo});
 if(p[0]==='auth'){
  await rateLimit('auth:'+ip,30,600000);const b=await body(req);
  if(p[1]==='register'&&method==='POST'){const c=await serviceConfig();const d=authSchema.parse(b);must(d.name,'Please enter your name.');must(!await one('SELECT id FROM users WHERE email=?',d.email),'An account with this email already exists.',409);must(c.demo||(c.mailKey&&c.mailFrom),'New registrations are not open yet. Please check back soon.',503);const id=uid('usr_');await run('INSERT INTO users (id,email,name,password_hash,role,status,email_verified,created_at) VALUES (?,?,?,?,?,?,?,?)',id,d.email,d.name,await passwordHash(d.password),'user','active',config().demo?1:0,now());if(!config().demo)try{await sendAuthMail(d.email,await makeAuthToken(id,'verify'),'verify')}catch{console.error('Verification delivery needs retry');}if(config().demo)await grantWelcomeCredits(id).catch(e=>console.error('Welcome credits need review',e instanceof Error?e.message:'unknown'));const cookie=await sessionCookie(id,req);return json({user:safeUser((await one('SELECT * FROM users WHERE id=?',id))!),verificationRequired:!config().demo},201,{'Set-Cookie':cookie});}
  if(p[1]==='login'&&method==='POST'){const d=authSchema.parse(b);await rateLimit('email:'+await hash(d.email),12,600000);const u=await one('SELECT * FROM users WHERE email=?',d.email);const dummy='pbkdf2$100000$0$0';const valid=await checkPassword(d.password,u?.password_hash||dummy);must(u&&valid,'Email or password is incorrect.',401);must(u.status==='active','This account is suspended. Contact the studio administrator.',403);return json({user:safeUser(u)},200,{'Set-Cookie':await sessionCookie(u.id,req)});}
  if(p[1]==='logout'&&method==='POST'){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1];if(token)await run('DELETE FROM sessions WHERE token_hash=?',await hash(token));return json({ok:true},200,{'Set-Cookie':clearCookie(req)});}
  if(p[1]==='forgot'&&method==='POST'){const c=await serviceConfig();const email=z.string().trim().email().parse(b.email).toLowerCase();await rateLimit('reset-email:'+await hash(email),3,3600000);const u=await one('SELECT * FROM users WHERE email=? AND status=?',email,'active');if(u&&(c.mailKey&&c.mailFrom)){try{await sendAuthMail(email,await makeAuthToken(u.id,'reset'),'reset')}catch{console.error('Password reset delivery failed');}}return json({ok:true,message:c.mailKey&&c.mailFrom?'If that account exists, a reset link will be sent.':'Email recovery is currently unavailable. Signed-in users can change their password in Account.'});}
  if(p[1]==='resend'&&method==='POST'){const user=await requireUser(req.headers);await rateLimit('verify-email:'+user.id,3,3600000);await sendAuthMail(user.email,await makeAuthToken(user.id,'verify'),'verify');return json({ok:true});}
  if(['verify','reset'].includes(p[1])&&method==='POST'){if(p[1]==='reset')z.string().min(10).max(128).parse(b.password);const token=z.string().min(32).max(100).parse(b.token);const t=await one('DELETE FROM auth_tokens WHERE token_hash=? AND type=? AND expires_at>? RETURNING *',await hash(token),p[1],now());must(t,'This link is invalid or has expired.',400);if(p[1]==='verify'){await batch([stmt('UPDATE users SET email_verified=1 WHERE id=?',t.user_id),stmt('DELETE FROM auth_tokens WHERE user_id=? AND type=?',t.user_id,'verify')]);await grantWelcomeCredits(t.user_id).catch(e=>console.error('Welcome credits need review',e instanceof Error?e.message:'unknown'));}else{const password=z.string().min(10).max(128).parse(b.password);await batch([stmt('UPDATE users SET password_hash=? WHERE id=?',await passwordHash(password),t.user_id),stmt('DELETE FROM auth_tokens WHERE user_id=? AND type=?',t.user_id,'reset'),stmt('DELETE FROM sessions WHERE user_id=?',t.user_id)]);}return json({ok:true});}
  throw new HttpError(404,'Authentication action not found.');
 }
 if(p[0]==='media'&&method==='GET'){
  const id=p[1];let a=await one('SELECT * FROM template_media WHERE id=?',id);const isPublic=!!a;if(!a)a=await one('SELECT * FROM user_uploads WHERE id=?',id);if(!a)a=await one('SELECT * FROM generated_assets WHERE id=?',id);must(a,'File not found.',404);
  const user=await getUser(req.headers);const signed=await validSignature(id,url);must(isPublic||signed||user?.id===a.user_id||user?.role==='admin','You do not have access to this file.',403);
  const obj=await storage.get(a.storage_key,req.headers.get('range')||undefined);must(obj,'The file is unavailable.',404);const h=new Headers({'Content-Type':a.mime,'X-Content-Type-Options':'nosniff','Cache-Control':isPublic?'public,max-age=3600':'private,no-store','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer'});obj.writeHttpMetadata(h);h.set('Content-Type',a.mime);if(url.searchParams.get('download')==='1'){h.set('Content-Disposition',`attachment; filename="project-studio-${id.slice(-10)}.${a.mime.startsWith('video')?'mp4':a.mime==='image/webp'?'webp':a.mime==='image/png'?'png':'jpg'}"`);if(user)await event('video_downloaded',user.id,{assetId:id});}
  if(req.headers.has('range')&&obj.range&&'offset' in obj.range){const offset=obj.range.offset||0;const length=obj.range.length||obj.size;h.set('Content-Range',`bytes ${offset}-${offset+length-1}/${obj.size}`);h.set('Content-Length',String(length));return new Response(obj.body,{status:206,headers:h});}h.set('Content-Length',String(obj.size));return new Response(obj.body,{headers:h});
 }
 const user=await requireUser(req.headers,p[0]==='admin');
 if(p[0]==='account'&&['password','sessions','export'].includes(p[1]))return await accountSecurity(req,p,user);
 await rateLimit('api:'+user.id,240);
 if(p[0]==='analytics'&&method==='POST'){const b=await body(req);const name=z.enum(['homepage_view','template_view','template_selected','upload_started','checkout_started']).parse(b.name);await event(name,user.id,{templateId:typeof b.templateId==='string'?b.templateId.slice(0,150):null});return json({ok:true});}
 if(p[0]==='uploads'){
  if(method==='POST'){await rateLimit('upload:'+user.id,40,3600000);must((await balanceOf(user.id)).available>0,'Buy credits to upload photos and create videos.',402);const usage=await one('SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM user_uploads WHERE user_id=?',user.id);must(usage&&usage.bytes<512*1024*1024&&usage.count<250,'Your photo storage is full. Remove unused uploads in Account.',413);
   const {file,bytes}=await readUploadedFile(req,8*1024*1024,'Photos must be under 8 MB.');must(usage.bytes+file.size<=512*1024*1024,'Your photo storage is full. Remove unused uploads in Account.',413);const mime=imageMime(bytes);must(mime&&mime===file.type,'Upload a valid JPG, PNG, or WEBP image.',415);const id=uid('up_');const key=`uploads/${user.id}/${id}`;await storage.put(key,bytes,mime);try{await run('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,created_at) VALUES (?,?,?,?,?,?,?)',id,user.id,key,mime,file.size,file.name.slice(0,120),now());}catch(e){await storage.delete(key);throw e}await event('upload_completed',user.id,{uploadId:id});return json({id,url:'/api/media/'+id,mime,name:file.name},201);
  }
  if(method==='GET')return json({uploads:await all('SELECT id,name,mime,size,created_at FROM user_uploads WHERE user_id=? ORDER BY created_at DESC LIMIT 250',user.id)});
  if(method==='DELETE'){const a=await one('SELECT * FROM user_uploads WHERE id=? AND user_id=?',p[1],user.id);must(a,'Upload not found.',404);const jobs=await all("SELECT input_ids FROM generations WHERE user_id=? AND status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL",user.id);must(!jobs.some(g=>parse<string[]>(g.input_ids,[]).includes(a.id)),'This photo is used by a pending generation. Delete or finish that creation first.',409);await storage.delete(a.storage_key);await run('DELETE FROM user_uploads WHERE id=?',a.id);return json({ok:true});}
 }
 if(p[0]==='favorites'){
  if(method==='GET')return json({ids:(await all('SELECT template_id FROM favorites WHERE user_id=?',user.id)).map(f=>f.template_id)});
  if(method==='POST'){const b=await body(req);const id=z.string().parse(b.templateId);must(await one('SELECT id FROM templates WHERE id=? AND active=1',id),'Template unavailable.',404);const existing=await one('SELECT id FROM favorites WHERE user_id=? AND template_id=?',user.id,id);if(existing)await run('DELETE FROM favorites WHERE id=?',existing.id);else await run('INSERT OR IGNORE INTO favorites (id,user_id,template_id,created_at) VALUES (?,?,?,?)',uid(),user.id,id,now());await event('template_favorited',user.id,{templateId:id,saved:!existing});return json({saved:!existing});}
 }
 if(p[0]==='generations'){
  if(method==='POST'&&!p[1]){await rateLimit('generate:'+user.id,30,3600000);return json(await startGeneration(user,await body(req)),201);}
  if(method==='GET')return json(await generationsFor(user.id,url,p[1]));
  if(method==='DELETE'){await removeGeneration(p[1],user.id);return json({ok:true});}
  if(method==='POST'&&p[2]==='share'){const a=await one("SELECT a.id FROM generated_assets a JOIN generations g ON g.id=a.generation_id WHERE g.id=? AND g.user_id=? AND g.deleted_at IS NULL AND g.status='completed' AND a.kind='output'",p[1],user.id);must(a,'Completed creation not found.',404);return json({url:await mediaUrl(a.id,now()+23*3600000)});}
 }
 if(p.join('/')==='queue/tick'&&method==='POST'){await rateLimit('tick:'+user.id,50);await tickQueue(user.id);return json({ok:true});}
 if(p[0]==='credits'){
  if(method==='GET'&&!p[1])return json(await balanceOf(user.id));
  if(method==='GET'&&p[1]==='history')return json(await creditHistory(user.id,url));
  if(method==='POST'&&p[1]==='checkout'){await rateLimit('credit-checkout:'+user.id,20,3600000);return json(await startPackCheckout(user,await body(req)),201);}
  if(p[1]==='purchases'){
   if(method==='GET'&&!p[2])return json(await listPurchases(user.id,url));
   const purchase=await purchaseFor(user.id,p[2]);
   if(method==='GET'&&!p[3])return json({purchase:publicPurchase(purchase),balance:await balanceOf(user.id)});
   if(method==='POST'&&p[3]==='pay'){const b=z.object({result:z.enum(['success','fail'])}).parse(await body(req));if(!await payTestPurchase(purchase,b.result)&&b.result==='fail')return json({error:'Test payment was declined. No charge was made. Please try again.'},402);return json({purchase:publicPurchase((await purchaseFor(user.id,purchase.id))),balance:await balanceOf(user.id)});}
   if(method==='POST'&&p[3]==='verify'){await verifyPackCheckout(purchase);return json({purchase:publicPurchase(await purchaseFor(user.id,purchase.id)),balance:await balanceOf(user.id)});}
   if(method==='POST'&&p[3]==='retry'){await rateLimit('credit-checkout:'+user.id,20,3600000);return json(await ensurePackCheckout(purchase,user.email,true));}
  }
 }
 if(p[0]==='account'){
  if(method==='PATCH'){const b=await body(req);const name=z.string().trim().min(2).max(80).parse(b.name);await run('UPDATE users SET name=? WHERE id=?',name,user.id);return json({ok:true});}
  if(method==='DELETE'&&!p[1]){await rateLimit('delete-account:'+user.id,5,900000);const b=z.object({password:z.string().min(1).max(128)}).parse(await body(req));const account=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(account&&await checkPassword(b.password,account.password_hash),'Your password is incorrect.',403);await deleteAccount(user);return json({ok:true},200,{'Set-Cookie':clearCookie(req)});}
 }
 if(p[0]==='admin')return await adminAPI(req,p,user);
 throw new HttpError(404,'This action could not be found.');
 }catch(e){if(e instanceof ZodError)return json({error:e.errors.map(x=>`${x.path.join('.')}: ${x.message}`).join('; ')},400);if(e instanceof HttpError)return json({error:e.message},e.status);console.error('API request failed',e instanceof Error?e.message:'unknown');return json({error:'Something went wrong. Please try again. Your saved work is safe.'},500);}}

async function adminAPI(req:Request,p:string[],user:StudioUser){const method=req.method;
 if(p[1]==='media'){if(method==='POST'&&!p[2])return json(await uploadTemplateMedia(req,user),201);if(method==='GET'&&!p[2])return json(await listTemplateMedia());if(method==='DELETE'&&p[2]){await deleteTemplateMedia(p[2],user);return json({ok:true});}}
 if(p[1]==='workflows'&&p[2]==='preset'&&method==='POST'){const b=z.object({name:z.string().min(2).max(100),slug:z.string().max(120),description:z.string().max(2000),requiredImageCount:z.number().int().min(1).max(4),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']),duration:z.union([z.literal(5),z.literal(10)]),estimatedCost:z.number().int().min(0)}).parse(await body(req));return json(liveWorkflow(b));}
 if(p[1]==='connections'&&p.length===2){if(method==='GET')return json(await connectionStatus());if(method==='PATCH')return json(await updateConnections(req,user));}
 if(p[1]==='operations'&&method==='GET')return json(await operationsSummary());
 if(p[1]==='activity'&&method==='GET')return json(await adminActivity(new URL(req.url)));
 if(['users','generations'].includes(p[1])&&method==='GET'&&!p[2])return json(await adminRecords(p[1],new URL(req.url)));
 if(p[1]==='operations'&&p[2]==='dispatch'&&method==='POST'){await rateLimit('admin-dispatch:'+user.id,6);const processed=await tickQueue();await audit(user.id,'queue.dispatch','queue');return json({processed});}
 if(p[1]==='dashboard'&&method==='GET'){
  const [users,metrics,revenue,costs,credits,top,recent,daily,recentPurchases,values,templates]=await Promise.all([
   one('SELECT COUNT(*) AS count FROM users'),
   one("SELECT COUNT(*) AS total,SUM(status='completed') AS completed,SUM(status='failed') AS failed,SUM(created_at>=?) AS today FROM generations WHERE deleted_at IS NULL OR status='completed'",now()-86400000),
   all("SELECT currency,SUM(status IN ('paid','reversed')) AS paid_count,SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS revenue,SUM(status='reversed') AS reversed_count,SUM(CASE WHEN status='reversed' THEN amount ELSE 0 END) AS reversed_amount FROM credit_purchases WHERE status IN ('paid','reversed') GROUP BY currency"),
   all('SELECT currency,SUM(estimated_cost) AS estimated_cost FROM generations WHERE started_at IS NOT NULL GROUP BY currency'),
   one("SELECT (SELECT COALESCE(-SUM(amount),0) FROM credit_entries WHERE account='system:issued') AS sold,(SELECT COALESCE(SUM(amount),0) FROM credit_entries WHERE account='system:consumed') AS consumed,(SELECT COALESCE(-SUM(amount),0) FROM credit_entries WHERE account='system:promo') AS granted,(SELECT COALESCE(SUM(available+held),0) FROM credit_balances) AS outstanding"),
   all("SELECT template_name,COUNT(*) AS count,SUM(credit_cost) AS credits FROM generations WHERE status='completed' GROUP BY template_name ORDER BY credits DESC LIMIT 5"),
   all('SELECT g.id,g.template_name,g.status,g.created_at,u.email FROM generations g LEFT JOIN users u ON u.id=g.user_id ORDER BY g.created_at DESC LIMIT 8'),
   all("SELECT strftime('%Y-%m-%d',paid_at/1000,'unixepoch') AS day,currency,SUM(amount) AS revenue,COUNT(*) AS count FROM credit_purchases WHERE status='paid' AND paid_at>=? GROUP BY day,currency ORDER BY day",now()-30*86400000),
   all('SELECT p.id,p.package_name,p.credits,p.amount,p.currency,p.status,p.created_at,u.email FROM credit_purchases p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 6'),
   creditValues(),
   all('SELECT name,credit_cost,estimated_cost,currency FROM templates WHERE active=1'),
  ]);
  const currencies=[...new Set([...revenue,...costs].map(r=>r.currency as string))];
  const financials=currencies.map(c=>({currency:c,revenue:0,paid_count:0,reversed_count:0,reversed_amount:0,estimated_cost:0,...revenue.find(r=>r.currency===c),...costs.find(r=>r.currency===c)}));
  // Gross margin per video at the cheapest credit price (largest pack bonus) in the template's cost currency.
  const profitable=templates.filter(t=>values[t.currency]!==undefined).map(t=>({name:t.name,currency:t.currency,credit_cost:t.credit_cost,estimated_cost:t.estimated_cost,value:Math.round(t.credit_cost*values[t.currency])})).sort((a,b)=>(b.value-b.estimated_cost)-(a.value-a.estimated_cost)).slice(0,5);
  return json({users:users?.count||0,metrics,financials,credits,top,recent,profitable,daily,recentPurchases,demo:config().demo,...await publicAvailability()});
 }
 if(p[1]==='templates'){
  if(method==='GET'){if(p[2]){const t=await getAdminTemplate(p[2]);must(t,'Template not found.',404);return json({template:t});}const [t,values]=await Promise.all([all('SELECT * FROM templates ORDER BY created_at DESC'),creditValues()]);return json({templates:t.map(t=>({...publicTemplate(t),estimatedCost:t.estimated_cost,provider:t.provider,model:t.model,costCurrency:t.currency,creditValue:values[t.currency]!==undefined?Math.round(t.credit_cost*values[t.currency]):null}))});}
  if(method==='POST'||method==='PATCH'){
   if(p[3]==='duplicate'){const original=await getAdminTemplate(p[2]);must(original,'Template not found.',404);const suffix=uid().slice(0,6);const t={...original,id:uid('tpl_'),slug:original.slug+'-copy-'+suffix,name:original.name+' (copy)',active:false,createdAt:now()};await batch(templateStatements(t));await audit(user.id,'template.duplicate',t.id);return json({template:t},201);}
   const b=templateSchema.parse(await body(req));await validateTemplateMedia(b);const existing=p[2]?await getAdminTemplate(p[2]):null;if(method==='PATCH')must(existing,'Template not found.',404);must(!await one('SELECT id FROM templates WHERE slug=? AND id!=?',b.slug,existing?.id||''),'This URL slug is already in use.',409);
   const t={...b,id:existing?.id||uid('tpl_'),createdAt:existing?.createdAt||now()} as AdminTemplate;await batch(templateStatements(t,!!existing));await audit(user.id,existing?'template.update':'template.create',t.id);if(existing){const kept=new Set(templateMediaUrls(t));await releaseTemplateMedia(templateMediaUrls(existing).filter(u=>!kept.has(u)));}return json({template:t},existing?200:201);
  }
  if(method==='DELETE'){const existing=await getAdminTemplate(p[2]);must(existing&&existing.id===p[2],'Template not found.',404);await run('DELETE FROM templates WHERE id=?',p[2]);await audit(user.id,'template.delete',p[2]);await releaseTemplateMedia(templateMediaUrls(existing));return json({ok:true});}
 }
 if(p[1]==='generations'){
  if(method==='GET'&&p[2]){const g=await one('SELECT g.*,u.email,h.status AS credit_status FROM generations g LEFT JOIN users u ON u.id=g.user_id LEFT JOIN credit_holds h ON h.id=g.hold_id WHERE g.id=?',p[2]);must(g,'Generation not found.',404);const steps=await all('SELECT * FROM generation_steps WHERE generation_id=? ORDER BY step_order',g.id);return json({generation:g,steps});}
  // A retry reserves the customer's credits again; failed attempts already returned theirs.
  if(method==='POST'&&p[3]==='retry'){
   const g=await one('SELECT * FROM generations WHERE id=?',p[2]);must(g?.status==='failed'&&!g.deleted_at&&g.user_id&&g.credit_cost>0,'Only failed creations of existing accounts can be retried.',409);
   const attempt=Number((await one('SELECT COUNT(*) AS n FROM credit_holds WHERE generation_id=?',g.id))?.n||0);
   await placeHold({userId:g.user_id,amount:g.credit_cost,generationId:g.id,key:`retry:${g.id}:${attempt}`,extra:(holdId,tx)=>{const c=onlyIfApplied(tx);return [
    stmt(`DELETE FROM generation_steps WHERE generation_id=? AND status!='completed' AND ${c.sql}`,g.id,...c.args),
    stmt(`UPDATE generations SET status='preparing',hold_id=?,error=NULL,internal_error=NULL,attempts=0,lease_until=0,next_run_at=?,started_at=?,completed_at=NULL WHERE id=? AND status='failed' AND ${c.sql}`,holdId,now(),now(),g.id,...c.args)];}})
    .catch(e=>{if(e instanceof HttpError&&e.status===402)throw new HttpError(402,'The customer does not have enough credits for a retry. Add credits to their account first.');throw e;});
   await audit(user.id,'generation.retry',g.id);return json({ok:true});
  }
 }
 if(p[1]==='users'&&p[3]==='credits'){
  const target=await one('SELECT id FROM users WHERE id=?',p[2]);must(target,'User not found.',404);
  if(method==='GET')return json({balance:await balanceOf(target.id),...await creditHistory(target.id,new URL(req.url))});
  if(method==='POST'){await rateLimit('credit-adjust:'+user.id,30,900000);const b=z.object({amount:z.number().int().min(-1000000).max(1000000).refine(n=>n!==0,'Enter a number of credits other than zero.'),reason:z.string().trim().min(3).max(200),currentPassword:z.string().min(1).max(128),idempotencyKey:z.string().uuid()}).parse(await body(req));
   const account=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(account&&await checkPassword(b.currentPassword,account.password_hash),'Your administrator password is incorrect.',403);
   const result=await adjust({userId:target.id,amount:b.amount,actorId:user.id,reason:b.reason,key:'adjust:'+b.idempotencyKey});if(result.applied)await audit(user.id,'credits.adjust',target.id);return json(result);}
 }
 // A refund or chargeback made in the POK dashboard is recorded here, since POK does not report it to the studio.
 if(p[1]==='credits'&&p[2]==='purchases'&&p[4]==='reverse'&&method==='POST'){await rateLimit('credit-adjust:'+user.id,30,900000);const b=z.object({reason:z.enum(['Payment refunded','Payment disputed']),currentPassword:z.string().min(1).max(128)}).parse(await body(req));
  const account=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(account&&await checkPassword(b.currentPassword,account.password_hash),'Your administrator password is incorrect.',403);
  const purchase=await one('SELECT id,status FROM credit_purchases WHERE id=?',p[3]);must(purchase,'Purchase not found.',404);must(purchase.status==='paid','Only a paid purchase can be reversed.',409);
  if(await reversePackPayment(purchase.id,b.reason,user.id))await audit(user.id,'credits.reverse-purchase',purchase.id);return json({ok:true});}
 if(p[1]==='credits'&&method==='GET'){if(p[2]==='ledger')return json(await creditLedger(new URL(req.url)));if(p[2]==='reconciliation')return json(await reconcileCredits());if(p[2]==='purchases')return json(await listPurchases(null,new URL(req.url)));}
 if(p[1]==='credit-packages'){
  if(method==='GET'&&!p[2])return json({packages:await listPackages(true)});
  if(method==='POST'&&!p[2])return json({package:await savePackage(null,await body(req),user)},201);
  if(method==='PATCH'&&p[2])return json({package:await savePackage(p[2],await body(req),user)});
  if(method==='DELETE'&&p[2]){await deletePackage(p[2],user);return json({ok:true});}
 }
 if(p[1]==='users'){
  if(method==='PATCH'){const b=await body(req);const status=z.enum(['active','suspended']).parse(b.status);must(!await one("SELECT id FROM users WHERE id=? AND role='admin'",p[2]),'Administrator accounts cannot be suspended here.',409);must(await one('SELECT id FROM users WHERE id=?',p[2]),'User not found.',404);await batch([stmt('UPDATE users SET status=? WHERE id=?',status,p[2]),...(status==='suspended'?[stmt('DELETE FROM sessions WHERE user_id=?',p[2])]:[])]);await audit(user.id,'user.'+status,p[2]);return json({ok:true});}
  if(method==='DELETE'){const u=await one('SELECT * FROM users WHERE id=?',p[2]);must(u,'User not found.',404);await deleteAccount(safeUser(u));await audit(user.id,'user.delete',p[2]);return json({ok:true});}
 }
 if(p[1]==='providers'){
  if(method==='GET'){const list=await all('SELECT * FROM provider_configurations');const c=await serviceConfig();return json({providers:list.map(p=>({...p,configured:p.id==='mock'?c.demo:p.id==='fal'?!!c.falKey:!!c.replicateKey})),demo:c.demo});}
  if(method==='PATCH'){const b=await body(req);const enabled=z.boolean().parse(b.enabled);must(['mock','fal','replicate'].includes(p[2]),'Unknown provider.');await run('UPDATE provider_configurations SET enabled=?,updated_at=? WHERE id=?',Number(enabled),now(),p[2]);await audit(user.id,'provider.update',p[2]);return json({ok:true});}
 }
 if(p[1]==='settings'){
  if(method==='GET'){const welcome=await one("SELECT value FROM app_settings WHERE key='welcome_credits'");const c=await serviceConfig();return json({welcomeCredits:Number(welcome?.value||0),demo:c.demo,paymentsConfigured:!!c.pokKeyId&&!!c.pokKeySecret&&!!c.pokMerchantId,emailConfigured:!!c.mailKey&&!!c.mailFrom,queueConfigured:!!c.cronSecret});}
  if(method==='PATCH'){const b=z.object({welcomeCredits:z.number().int().min(0).max(100000)}).parse(await body(req));
   await run("INSERT INTO app_settings (key,value) VALUES ('welcome_credits',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(b.welcomeCredits));await audit(user.id,'settings.update','welcome_credits');
   return json({ok:true});}
 }
 throw new HttpError(404,'Admin action not found.');
}
