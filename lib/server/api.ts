import {liveWorkflow} from './workflow-presets';
import {assertGeneratable,connectionStatus,maintenanceStatus,providerConfigured,publicAvailability,serviceConfig,updateConnections} from './connections';
import {ZodError,z} from 'zod';
import {jsonBody,pageQuery,readUploadedFile} from './http';
import {cleanImage} from './image-clean';
import {creditValues,deletePackage,ensurePackCheckout,listPackages,listPurchases,payTestPurchase,publicPurchase,purchaseFor,reversePackPayment,savePackage,startPackCheckout,verifyPackCheckout} from './credit-purchases';
import {adjust,balanceOf,creditHistory,creditLedger,grantWelcomeCredits,onlyIfApplied,placeHold,reconcileCredits} from './credits';
import {deleteTemplateMedia,listTemplateMedia,releaseTemplateMedia,templateMediaUrls,uploadTemplateMedia} from './template-media';
import {queryCatalog} from './catalog-query';
import {validateTemplateMedia} from './validation';
import {operationsSummary,adminActivity,accountSecurity,adminRecords} from './operations';
import {all,audit,batch,config,ensureSeed,event,getAdminTemplate,HttpError,must,now,one,parse,photoGuidelines,supportInfo,publicTemplate,run,stmt,templateStatements,uid,type Row} from './data';
import {authSchema,registerSchema,generationSchema,templateSchema} from './validation';
import {checkPassword,clearCookie,constantEqual,getUser,hash,makeAuthToken,passwordHash,protectOrigin,rateLimit,requireUser,safeUser,sendAuthMail,sessionCookie} from './security';
import {imageMime,storage,validSignature} from './storage';
import {pokWebhook} from './payments';
import {removeGeneration,tickQueue} from './queue';
import {createReport,listReports,reportDetail,resolveReport,reportsForGenerations,publicReport,hasOpenReport,uploadsLockedByReport,userHasOpenReport} from './reports';
import {assertWithinLimits,spendingLimits} from './limits';
import {exchangeRates,convertMinor} from './rates';
import {dispatcherStatus,recordDispatch} from './dispatcher';
import {reportError} from './errors';
import {adminExport} from './exports';
import {shareGeneration,sharedMap,sharedVideoRedirect,stopSharing} from './share';
import {createRemovalRequest,listRemovals,resolveRemoval} from './removals';
import {listVersions,recordVersion,restoreVersion} from './template-history';
import {templateStats} from './template-stats';
import {feed,hideFromFeed,rateCreation,setPublic,toggleLike} from './feed';
import {adminIdeas,listIdeas,suggestIdea,toggleVote,updateIdea} from './template-requests';
import {cancelAnnouncement,createAnnouncement,listAnnouncements,sendTest,unsubscribe} from './announcements';
import {finishSecondStep,mfaAPI,startSecondStep} from './mfa';
import {langFromCookie,translate,type Lang} from '../i18n';
/** Friendly, translated messages for the form fields customers fill in; other validation messages stay technical. */
const fieldMessages:Record<string,string>={email:'Enter a valid email address.',password:'Use a password with 10 to 128 characters.',newPassword:'Use a password with 10 to 128 characters.',name:'Enter a name with 2 to 80 characters.',acceptTerms:'Accept the Terms and Privacy Policy to continue.',confirmAge:'Confirm your age to continue.'};
const zodDefault=/^(String must|Invalid|Required|Expected|Number must)/;
const fieldMessage=(lang:Lang,path:string,message:string)=>fieldMessages[path]?translate(lang,zodDefault.test(message)?fieldMessages[path]:message):zodDefault.test(message)?`${path}: ${message}`:translate(lang,message);
import {TERMS_VERSION,cleanGuidelineList,isStaff,type AdminTemplate,type StudioUser} from '../contracts';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers}});
const body=jsonBody;
const generationPublic=(g:Row)=>({id:g.id,templateName:g.template_name,templateSlug:g.template_slug,thumbnail:g.thumbnail,status:g.status,creditCost:g.credit_cost,creditStatus:g.credit_status??null,createdAt:g.created_at,startedAt:g.started_at,completedAt:g.completed_at,error:g.error,assetId:g.asset_id,isRedo:!!g.report_id});
async function generationsFor(userId:string,url:URL,id?:string){
 const {page,limit,offset}=pageQuery(url,24),status=url.searchParams.get('status')||'all';
 const conditions=['g.user_id=?','g.deleted_at IS NULL'],args:unknown[]=[userId];
 if(id){conditions.push('g.id=?');args.push(id);}
 if(status==='processing')conditions.push("g.status IN ('queued','preparing','generating','finalizing')");
 else if(status!=='all'){must(['completed','failed'].includes(status),'Unknown creation status.');conditions.push('g.status=?');args.push(status);}
 const where=' WHERE '+conditions.join(' AND ');
 const count=await one('SELECT COUNT(*) AS total FROM generations g'+where,...args);
 const rows=await all("SELECT g.*,a.id AS asset_id,h.status AS credit_status,tp.credit_cost AS current_cost FROM generations g LEFT JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output' LEFT JOIN credit_holds h ON h.id=g.hold_id LEFT JOIN templates tp ON tp.id=g.template_id AND tp.active=1"+where+' ORDER BY g.created_at DESC,g.id LIMIT ? OFFSET ?',...args,limit,offset);
 if(id)must(rows.length,'Creation not found.',404);
 // Counted independently of the status filter so the client knows whether to keep polling.
 const active=await one("SELECT COUNT(*) AS total FROM generations WHERE user_id=? AND deleted_at IS NULL AND status IN ('queued','preparing','generating','finalizing')",userId);
 const reportsMap=await reportsForGenerations(rows.map(g=>g.id as string));const shares=await sharedMap(rows.map(g=>g.id as string));
 // V5: an estimate from how long this template's recent videos took (median-ish via average of the last 20), else 2 minutes.
 const running=[...new Set(rows.filter(g=>['queued','preparing','generating','finalizing'].includes(g.status as string)).map(g=>g.template_id as string))];
 const typical=new Map<string,number>();for(const tid of running){const r=await one("SELECT AVG(d) AS avg FROM (SELECT completed_at-started_at AS d FROM generations WHERE template_id=? AND status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 20)",tid);typical.set(tid,Math.round(Number(r?.avg||120000)/1000));}
 // V20: a finished video can be made again while its template is live and its photos are still there.
 const photoIds=[...new Set(rows.flatMap(g=>parse<string[]>(g.input_ids,[])))];const kept=new Set(photoIds.length?(await all(`SELECT id FROM user_uploads WHERE user_id=? AND id IN (${photoIds.map(()=>'?').join(',')})`,userId,...photoIds)).map(r=>r.id as string):[]);
 const generations=rows.map(g=>{const r=reportsMap.get(g.id as string);const inputs=parse<string[]>(g.input_ids,[]);return {...generationPublic(g),typicalSeconds:typical.get(g.template_id as string)??null,rating:g.rating??null,isPublic:!!g.public_at,report:r?publicReport(r):null,shareUrl:shares.get(g.id as string)??null,repeatCost:g.status==='completed'&&g.current_cost&&inputs.length&&inputs.every(id=>kept.has(id))?Number(g.current_cost):null};});
 return {generations,activeCount:active?.total||0,pagination:{page,limit,total:count?.total||0,pages:Math.max(1,Math.ceil((count?.total||0)/limit))}};
}
async function deleteAccount(user:StudioUser){must(!isStaff(user.role),'A staff account cannot be deleted here. Ask an administrator to change its role first.',409);must(!await userHasOpenReport(user.id),'A video is under review. Please wait until the report is resolved before deleting the account.',409);must(!await one("SELECT id FROM generations WHERE user_id=? AND status IN ('queued','preparing','generating','finalizing') LIMIT 1",user.id),'Wait for active generations to finish before deleting your account.',409);const objects=await all('SELECT storage_key FROM user_uploads WHERE user_id=? UNION ALL SELECT storage_key FROM generated_assets WHERE user_id=?',user.id,user.id);await batch([stmt("UPDATE generations SET deleted_at=?,input_ids='[]',context='{}' WHERE user_id=?",now(),user.id),stmt('DELETE FROM analytics_events WHERE user_id=?',user.id),stmt('DELETE FROM users WHERE id=?',user.id)]);
 // Records go first, so a failed file removal leaves an unreferenced file rather than a record pointing at nothing.
 for(const o of objects)await storage.delete(o.storage_key).catch(e=>reportError('storage','Account file removal needs a retry',{error:e,context:{key:o.storage_key as string}}));}

/** Starts a creation by reserving its credits; the queue charges them on delivery and returns them on failure. */
/** Three content refusals block uploads, creations and purchases until an administrator unblocks the account. */
function assertNotBlocked(user:StudioUser){must(!user.blocked,'Your account can no longer upload photos or create videos because content was refused 3 times. Contact support if you think this is a mistake.',403);}
async function startGeneration(user:StudioUser,input:unknown){assertNotBlocked(user);
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
 await assertWithinLimits(user.id);
 const balance=await balanceOf(user.id);must(balance.available>=t.creditCost,`You need ${t.creditCost} credits for this video and have ${balance.available}.`,402);
 const generationId=uid('gen_'),created=now();
 const snapshot={name:t.name,slug:t.slug,aspectRatio:t.aspectRatio,duration:t.duration,steps:t.workflow.map(s=>({...s,prompt:s.prompt||t.hiddenPrompt,negativePrompt:s.negativePrompt||t.negativePrompt,settings:{...t.settings,...s.settings}}))};
 const hold=await placeHold({userId:user.id,amount:t.creditCost,generationId,key,extra:(holdId,tx)=>{const g=onlyIfApplied(tx);return [stmt(`INSERT INTO generations (id,user_id,template_id,template_name,template_slug,thumbnail,status,currency,estimated_cost,credit_cost,hold_id,workflow_snapshot,input_ids,next_run_at,created_at) SELECT ?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,? WHERE ${g.sql}`,
  generationId,user.id,t.id,t.name,t.slug,t.thumbnail,t.currency,t.estimatedCost,t.creditCost,holdId,JSON.stringify(snapshot),JSON.stringify(b.uploadIds),created,created,...g.args)];}});
 if(!hold.applied){const again=await repeat();must(again,'This creation could not be started. Please try again.',409);return again;}
 await event('generation_requested',user.id,{generationId,credits:t.creditCost});
 return {generationId,balance:{available:hold.available,held:hold.held}};
}

/** Everything an administrator needs about one customer on a single page. */
async function adminUserDetail(id:string){
 const u=await one('SELECT id,name,email,role,status,email_verified,created_at,content_strikes,blocked_at,totp_enabled_at,locale FROM users WHERE id=?',id);must(u,'User not found.',404);
 const [sessions,uploads,count,generations,refused,activity,reports]=await Promise.all([
  one('SELECT COUNT(*) AS active,MAX(expires_at) AS latest FROM sessions WHERE user_id=? AND expires_at>?',id,now()),
  one('SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM user_uploads WHERE user_id=?',id),
  one("SELECT COUNT(*) AS total,SUM(status='completed') AS completed,SUM(status='failed') AS failed FROM generations WHERE user_id=? AND deleted_at IS NULL",id),
  all("SELECT g.id,g.template_name,g.status,g.credit_cost,g.created_at,g.completed_at,g.error,h.status AS credit_status FROM generations g LEFT JOIN credit_holds h ON h.id=g.hold_id WHERE g.user_id=? AND g.deleted_at IS NULL ORDER BY g.created_at DESC LIMIT 20",id),
  all("SELECT id,template_name,created_at,internal_error,input_ids FROM generations WHERE user_id=? AND status='refused' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20",id),
  all('SELECT a.id,a.action,a.created_at,actor.email AS actor_email FROM audit_logs a LEFT JOIN users actor ON actor.id=a.user_id WHERE a.target_id=? OR a.user_id=? ORDER BY a.created_at DESC LIMIT 20',id,id),
  all('SELECT r.id,r.reason,r.status,r.resolution,r.created_at,g.template_name FROM generation_reports r JOIN generations g ON g.id=r.generation_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 20',id),
 ]);
 // Refused photos stay viewable for review while the customer keeps them; deleted ones are simply not listed.
 const photoIds=[...new Set(refused.flatMap(r=>parse<string[]>(r.input_ids,[])))];
 const kept=new Set(photoIds.length?(await all(`SELECT id FROM user_uploads WHERE user_id=? AND id IN (${photoIds.map(()=>'?').join(',')})`,id,...photoIds)).map(r=>r.id as string):[]);
 return {user:{id:u.id,name:u.name,email:u.email,role:u.role,status:u.status,created_at:u.created_at,email_verified:!!u.email_verified,content_strikes:Number(u.content_strikes||0),blocked_at:u.blocked_at??null,two_factor:!!u.totp_enabled_at,locale:u.locale||'sq'},balance:await balanceOf(id),reports,
  refusals:refused.map(r=>({id:r.id,template_name:r.template_name,created_at:r.created_at,reason:r.internal_error,photos:parse<string[]>(r.input_ids,[]).filter(p=>kept.has(p)).map(p=>'/api/media/'+p)})),
  // Sessions last seven days, so the newest expiry tells when the customer last signed in.
  sessions:{active:Number(sessions?.active||0),lastSignIn:sessions?.latest?Number(sessions.latest)-7*86400000:null},
  uploads:{count:Number(uploads?.count||0),bytes:Number(uploads?.bytes||0)},
  creations:{total:Number(count?.total||0),completed:Number(count?.completed||0),failed:Number(count?.failed||0),recent:generations},activity};
}

export async function handleAPI(req:Request){try{
 const url=new URL(req.url);const p=url.pathname.slice(5).split('/').filter(Boolean);const method=req.method;
 await ensureSeed();
 if(p.join('/')==='webhooks/pok'&&method==='POST'){const purchase=await pokWebhook(req);if(purchase)await verifyPackCheckout(purchase);return json({received:true});}
 // One-click unsubscribe (V36): mail apps POST here with no origin or cookie; the link itself is signed.
 if(p.join('/')==='unsubscribe'&&method==='POST'){const u=url.searchParams.get('u')||'',s=url.searchParams.get('s')||'';const b=req.headers.get('content-type')?.includes('json')?await body(req).catch(()=>({})) as Record<string,unknown>:{};return json(await unsubscribe(u||String(b.u||''),s||String(b.s||'')));}
 protectOrigin(req);
 if(p.join('/')==='queue/dispatch'&&method==='POST'){must(config().cronSecret&&constantEqual(req.headers.get('authorization')||'','Bearer '+config().cronSecret),'Unauthorized queue worker.',401);const processed=await tickQueue();await recordDispatch('external');return json({processed});}
 const ip=req.headers.get('cf-connecting-ip')||'local';
 if(p.join('/')==='health'&&method==='GET')return json({status:'ok',demo:config().demo});
 if(p[0]==='templates'&&method==='GET'&&p.length<=2)return json(await queryCatalog(url,p[1]));
 if(p.join('/')==='credit-packages'&&method==='GET')return json({packages:await listPackages()});
 if(p.join('/')==='removal-requests'&&method==='POST'){await rateLimit('removal:'+await hash(req.headers.get('cf-connecting-ip')||'anon'),5,3600000);return json(await createRemovalRequest(await body(req),langFromCookie(req.headers.get('cookie'))),201);}
 if(p[0]==='share'&&p[2]==='video'&&method==='GET')return await sharedVideoRedirect(p[1]);
 if(p.join('/')==='feed'&&method==='GET')return json(await feed(url,await getUser(req.headers)));
 if(p.join('/')==='ideas'&&method==='GET')return json(await listIdeas(await getUser(req.headers)));
 if(p[0]==='me'&&method==='GET')return json({user:await getUser(req.headers),demo:config().demo});
 if(p[0]==='analytics'&&method==='POST'){const viewer=await getUser(req.headers);await rateLimit('analytics:'+await hash(req.headers.get('cf-connecting-ip')||'anon'),180,60000);const b=await body(req);const name=z.enum(['homepage_view','template_view','template_selected','upload_started','checkout_started']).parse(b.name);await event(name,viewer?.id??null,{templateId:typeof b.templateId==='string'?b.templateId.slice(0,150):null});return json({ok:true});}
 if(p[0]==='auth'){
  await rateLimit('auth:'+ip,30,600000);const b=await body(req);
  if(p[1]==='register'&&method==='POST'){const c=await serviceConfig();const d=registerSchema.parse(b);must(!await one('SELECT id FROM users WHERE email=?',d.email),'An account with this email already exists.',409);must(c.demo||(c.mailKey&&c.mailFrom),'New registrations are not open yet. Please check back soon.',503);const id=uid('usr_'),at=now();const lang=langFromCookie(req.headers.get('cookie'));await run('INSERT INTO users (id,email,name,password_hash,role,status,email_verified,created_at,terms_version,terms_accepted_at,age_confirmed_at,marketing_opt_in,marketing_opt_in_at,locale) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,d.email,d.name,await passwordHash(d.password),'user','active',config().demo?1:0,at,TERMS_VERSION,at,at,d.marketingOptIn?1:0,d.marketingOptIn?at:null,lang);if(!config().demo)try{await sendAuthMail(d.email,await makeAuthToken(id,'verify'),'verify',lang)}catch(e){await reportError('email','Verification email could not be sent',{error:e,context:{userId:id}});}if(config().demo)await grantWelcomeCredits(id).catch(e=>reportError('credits','Welcome credits need review',{error:e}));const cookie=await sessionCookie(id,req);return json({user:safeUser((await one('SELECT * FROM users WHERE id=?',id))!),verificationRequired:!config().demo},201,{'Set-Cookie':cookie});}
  if(p[1]==='login'&&method==='POST'){const d=authSchema.parse(b);await rateLimit('email:'+await hash(d.email),12,600000);const u=await one('SELECT * FROM users WHERE email=?',d.email);const dummy='pbkdf2$100000$0$0';const valid=await checkPassword(d.password,u?.password_hash||dummy);must(u&&valid,'Email or password is incorrect.',401);must(u.status==='active','This account is suspended. Contact the studio administrator.',403);if(u.totp_enabled_at)return json({mfaRequired:true,ticket:await startSecondStep(u.id)});return json({user:safeUser(u)},200,{'Set-Cookie':await sessionCookie(u.id,req)});}
  if(p[1]==='mfa'&&method==='POST'){const r=await finishSecondStep(req,b);return json({user:safeUser(r.user)},200,{'Set-Cookie':r.cookie});}
  if(p[1]==='logout'&&method==='POST'){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1];if(token)await run('DELETE FROM sessions WHERE token_hash=?',await hash(token));return json({ok:true},200,{'Set-Cookie':clearCookie(req)});}
  if(p[1]==='forgot'&&method==='POST'){const c=await serviceConfig();const email=z.string().trim().email().parse(b.email).toLowerCase();await rateLimit('reset-email:'+await hash(email),3,3600000);const u=await one('SELECT * FROM users WHERE email=? AND status=?',email,'active');if(u&&(c.mailKey&&c.mailFrom)){try{await sendAuthMail(email,await makeAuthToken(u.id,'reset'),'reset',u.locale==='en'?'en':'sq')}catch(e){await reportError('email','Password reset email could not be sent',{error:e,context:{userId:u.id as string}});}}return json({ok:true,message:translate(langFromCookie(req.headers.get('cookie')),c.mailKey&&c.mailFrom?'If that account exists, a reset link will be sent.':'Email recovery is currently unavailable. Signed-in users can change their password in Account.')});}
  if(p[1]==='resend'&&method==='POST'){const user=await requireUser(req.headers);if(user.emailVerified)return json({ok:true,alreadyVerified:true});await rateLimit('verify-email:'+user.id,3,3600000);await sendAuthMail(user.email,await makeAuthToken(user.id,'verify'),'verify',user.locale);return json({ok:true});}
  // V18: the new address is confirmed with a link sent to it; the old address is told about the change.
  if(p[1]==='email-change'&&method==='POST'){const token=z.string().min(32).max(100).parse(b.token);const t=await one("DELETE FROM auth_tokens WHERE token_hash=? AND type='email' AND expires_at>? RETURNING *",await hash(token),now());must(t,'This link is invalid or has expired.',400);const u=await one('SELECT id,email,pending_email,locale FROM users WHERE id=?',t.user_id);must(u?.pending_email,'This link is invalid or has expired.',400);must(!await one('SELECT id FROM users WHERE email=? AND id!=?',u.pending_email,u.id),'An account with this email already exists.',409);
   await run('UPDATE users SET email=?,pending_email=NULL,email_verified=1 WHERE id=?',u.pending_email,u.id);await audit(u.id as string,'account.email-changed',u.id as string);
   const {sendMail}=await import('./security');const {noticeMailContent}=await import('./email-templates');const c=await serviceConfig();await sendMail(u.email as string,noticeMailContent({lang:u.locale==='en'?'en':'sq',brand:c.brandName,subject:'Your {brand} email was changed',heading:'Your email was changed',lead:'The email of your account is now {email}. If you did not do this, contact us right away.',vars:{email:u.pending_email as string},supportEmail:c.mailFrom}),'email-changed-'+t.token_hash);
   return json({ok:true});}
  if(['verify','reset'].includes(p[1])&&method==='POST'){if(p[1]==='reset')z.string().min(10).max(128).parse(b.password);const token=z.string().min(32).max(100).parse(b.token);const t=await one('DELETE FROM auth_tokens WHERE token_hash=? AND type=? AND expires_at>? RETURNING *',await hash(token),p[1],now());must(t,'This link is invalid or has expired.',400);if(p[1]==='verify'){await batch([stmt('UPDATE users SET email_verified=1 WHERE id=?',t.user_id),stmt('DELETE FROM auth_tokens WHERE user_id=? AND type=?',t.user_id,'verify')]);await grantWelcomeCredits(t.user_id).catch(e=>reportError('credits','Welcome credits need review',{error:e}));}else{const password=z.string().min(10).max(128).parse(b.password);await batch([stmt('UPDATE users SET password_hash=? WHERE id=?',await passwordHash(password),t.user_id),stmt('DELETE FROM auth_tokens WHERE user_id=? AND type=?',t.user_id,'reset'),stmt('DELETE FROM sessions WHERE user_id=?',t.user_id)]);}return json({ok:true});}
  throw new HttpError(404,'Authentication action not found.');
 }
 if(p[0]==='media'&&method==='GET'){
  const id=p[1];let a=await one('SELECT * FROM template_media WHERE id=?',id);const isPublic=!!a;if(!a)a=await one('SELECT * FROM user_uploads WHERE id=?',id);if(!a)a=await one('SELECT * FROM generated_assets WHERE id=?',id);must(a,'File not found.',404);
  const user=await getUser(req.headers);const signed=await validSignature(id,url);must(isPublic||signed||user?.id===a.user_id||isStaff(user?.role),'You do not have access to this file.',403);
  const obj=await storage.get(a.storage_key,req.headers.get('range')||undefined);must(obj,'The file is unavailable.',404);const h=new Headers({'Content-Type':a.mime,'X-Content-Type-Options':'nosniff','Cache-Control':isPublic?'public,max-age=3600':'private,no-store','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer'});obj.writeHttpMetadata(h);h.set('Content-Type',a.mime);if(url.searchParams.get('download')==='1'){h.set('Content-Disposition',`attachment; filename="project-studio-${id.slice(-10)}.${a.mime.startsWith('video')?'mp4':a.mime==='image/webp'?'webp':a.mime==='image/png'?'png':'jpg'}"`);if(user)await event('video_downloaded',user.id,{assetId:id});}
  if(req.headers.has('range')&&obj.range&&'offset' in obj.range){const offset=obj.range.offset||0;const length=obj.range.length||obj.size;h.set('Content-Range',`bytes ${offset}-${offset+length-1}/${obj.size}`);h.set('Content-Length',String(length));return new Response(obj.body,{status:206,headers:h});}h.set('Content-Length',String(obj.size));return new Response(obj.body,{headers:h});
 }
 const user=await requireUser(req.headers,p[0]==='admin');
 if(p[0]==='account'&&['password','sessions','export'].includes(p[1]))return await accountSecurity(req,p,user);
 if(p[0]==='account'&&p[1]==='mfa')return json(await mfaAPI(req,p,user));
 await rateLimit('api:'+user.id,240);
 if(p[0]==='uploads'){
  if(method==='POST'){assertNotBlocked(user);await rateLimit('upload:'+user.id,40,3600000);must((await balanceOf(user.id)).available>0,'Buy credits to upload photos and create videos.',402);const usage=await one('SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM user_uploads WHERE user_id=?',user.id);must(usage&&usage.bytes<512*1024*1024&&usage.count<250,'Your photo storage is full. Remove unused uploads in Account.',413);
   const {file,bytes}=await readUploadedFile(req,8*1024*1024,'Photos must be under 8 MB.');must(usage.bytes+file.size<=512*1024*1024,'Your photo storage is full. Remove unused uploads in Account.',413);const mime=imageMime(bytes);must(mime&&mime===file.type,'Upload a valid JPG, PNG, or WEBP image.',415);
   // Store a cleaned copy: no location or other metadata, nothing hidden after the image, real size checked.
   const clean=cleanImage(bytes,mime);must(clean,'This photo could not be read. Try another JPG, PNG or WEBP photo.',415);
   must(Math.min(clean.width,clean.height)>=512,`This photo is too small (${clean.width} × ${clean.height}). Use a photo at least 512 × 512 pixels.`,422);
   const id=uid('up_');const key=`uploads/${user.id}/${id}`;await storage.put(key,clean.bytes,mime);try{await run('INSERT INTO user_uploads (id,user_id,storage_key,mime,size,name,created_at) VALUES (?,?,?,?,?,?,?)',id,user.id,key,mime,clean.bytes.length,file.name.slice(0,120),now());}catch(e){await storage.delete(key);throw e}await event('upload_completed',user.id,{uploadId:id});return json({id,url:'/api/media/'+id,mime,name:file.name},201);
  }
  if(method==='GET')return json({uploads:(await all('SELECT id,name,mime,size,created_at,saved_at,label,is_default FROM user_uploads WHERE user_id=? ORDER BY is_default DESC,saved_at IS NULL,created_at DESC LIMIT 250',user.id)).map(u=>({...u,saved:!!u.saved_at,isDefault:!!u.is_default,url:'/api/media/'+u.id}))});
  // V17: save a photo for later videos (kept past the 24-hour cleanup), name it, and pick a default.
  if(method==='PATCH'&&p[1]){const b=z.object({saved:z.boolean().optional(),label:z.string().trim().max(40).optional(),isDefault:z.boolean().optional()}).parse(await body(req));const a=await one('SELECT id,saved_at FROM user_uploads WHERE id=? AND user_id=?',p[1],user.id);must(a,'Upload not found.',404);
   if(b.saved===true&&!a.saved_at){const n=await one('SELECT COUNT(*) AS n FROM user_uploads WHERE user_id=? AND saved_at IS NOT NULL',user.id);must(Number(n?.n||0)<20,'You can keep up to 20 saved photos. Delete one in Account first.',409);}
   const saved=b.saved??!!a.saved_at;
   await batch([...(b.isDefault?[stmt('UPDATE user_uploads SET is_default=0 WHERE user_id=?',user.id)]:[]),stmt('UPDATE user_uploads SET saved_at=?,label=COALESCE(?,label),is_default=CASE WHEN ?=0 THEN 0 WHEN ? IS NULL THEN is_default ELSE ? END WHERE id=?',saved?(a.saved_at||now()):null,b.label??null,saved?1:0,b.isDefault===undefined?null:1,b.isDefault?1:0,a.id)]);
   return json({ok:true});}
  if(method==='DELETE'){const a=await one('SELECT * FROM user_uploads WHERE id=? AND user_id=?',p[1],user.id);must(a,'Upload not found.',404);const jobs=await all("SELECT input_ids FROM generations WHERE user_id=? AND status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL",user.id);must(!jobs.some(g=>parse<string[]>(g.input_ids,[]).includes(a.id)),'This photo is used by a pending generation. Delete or finish that creation first.',409);must(!(await uploadsLockedByReport(user.id)).has(a.id),'This photo is part of a video under review. You can delete it once the report is resolved.',409);await storage.delete(a.storage_key);await run('DELETE FROM user_uploads WHERE id=?',a.id);return json({ok:true});}
 }
 if(p[0]==='ideas'){if(method==='POST'&&!p[1])return json(await suggestIdea(user,await body(req)),201);if(method==='POST'&&p[2]==='vote')return json(await toggleVote(user,p[1]));}
 if(p[0]==='favorites'){
  if(method==='GET')return json({ids:(await all('SELECT template_id FROM favorites WHERE user_id=?',user.id)).map(f=>f.template_id)});
  if(method==='POST'){const b=await body(req);const id=z.string().parse(b.templateId);must(await one('SELECT id FROM templates WHERE id=? AND active=1',id),'Template unavailable.',404);const existing=await one('SELECT id FROM favorites WHERE user_id=? AND template_id=?',user.id,id);if(existing)await run('DELETE FROM favorites WHERE id=?',existing.id);else await run('INSERT OR IGNORE INTO favorites (id,user_id,template_id,created_at) VALUES (?,?,?,?)',uid(),user.id,id,now());await event('template_favorited',user.id,{templateId:id,saved:!existing});return json({saved:!existing});}
 }
 if(p[0]==='generations'){
  if(method==='POST'&&!p[1]){await rateLimit('generate:'+user.id,30,3600000);return json(await startGeneration(user,await body(req)),201);}
  if(method==='GET')return json(await generationsFor(user.id,url,p[1]));
  if(method==='POST'&&p[2]==='report'){return json(await createReport(user,p[1],await body(req)),201);}
  if(method==='POST'&&p[2]==='rating')return json(await rateCreation(user,p[1],Number((await body(req)).stars)));
  if(method==='POST'&&p[2]==='public')return json(await setPublic(user,p[1],(await body(req)).public===true));
  if(method==='POST'&&p[2]==='like')return json(await toggleLike(user,p[1]));
  if(method==='POST'&&p[2]==='again'){await rateLimit('generate:'+user.id,30,3600000);const b=z.object({idempotencyKey:z.string().uuid(),expectedCost:z.number().int()}).parse(await body(req));const g=await one("SELECT template_id,input_ids FROM generations WHERE id=? AND user_id=? AND status='completed' AND deleted_at IS NULL",p[1],user.id);must(g,'Completed creation not found.',404);return json(await startGeneration(user,{templateId:g.template_id,uploadIds:parse<string[]>(g.input_ids,[]),idempotencyKey:b.idempotencyKey,expectedCost:b.expectedCost,consent:true}),201);}
  if(method==='DELETE'&&!p[2]){must(!await hasOpenReport(p[1]),'This creation is under review. You can delete it once the report is resolved.',409);await removeGeneration(p[1],user.id);return json({ok:true});}
  if(method==='POST'&&p[2]==='share')return json(await shareGeneration(user.id,p[1]));
  if(method==='DELETE'&&p[2]==='share'){await stopSharing(user.id,p[1]);return json({ok:true});}
 }
 if(p.join('/')==='queue/tick'&&method==='POST'){await rateLimit('tick:'+user.id,50);await tickQueue(user.id);return json({ok:true});}
 if(p[0]==='credits'){
  if(method==='GET'&&!p[1])return json(await balanceOf(user.id));
  if(method==='GET'&&p[1]==='history')return json(await creditHistory(user.id,url));
  if(method==='POST'&&p[1]==='checkout'){assertNotBlocked(user);await rateLimit('credit-checkout:'+user.id,20,3600000);return json(await startPackCheckout(user,await body(req)),201);}
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
  if(method==='PATCH'){const b=await body(req);if(typeof b.marketingOptIn==='boolean'&&b.name===undefined){await run('UPDATE users SET marketing_opt_in=?,marketing_opt_in_at=? WHERE id=?',b.marketingOptIn?1:0,b.marketingOptIn?now():null,user.id);await audit(user.id,b.marketingOptIn?'account.news-on':'account.news-off',user.id);return json({ok:true});}const name=z.string().trim().min(2).max(80).parse(b.name);await run('UPDATE users SET name=? WHERE id=?',name,user.id);return json({ok:true});}
  if(method==='POST'&&p[1]==='email'){await rateLimit('change-email:'+user.id,5,3600000);const b=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(1).max(128)}).parse(await body(req));
   const me=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(me&&await checkPassword(b.password,me.password_hash),'Your password is incorrect.',403);must(b.email!==user.email,'This is already your email.');must(!await one('SELECT id FROM users WHERE email=?',b.email),'An account with this email already exists.',409);
   const c=await serviceConfig();
   if(c.demo&&!(c.mailKey&&c.mailFrom)){await run('UPDATE users SET email=?,pending_email=NULL WHERE id=?',b.email,user.id);await audit(user.id,'account.email-changed',user.id);return json({changed:true});}
   await run('UPDATE users SET pending_email=? WHERE id=?',b.email,user.id);const token=await makeAuthToken(user.id,'email');await sendAuthMail(b.email,token,'email',user.locale);await audit(user.id,'account.email-change-requested',user.id);return json({pending:b.email});}
  if(method==='DELETE'&&p[1]==='email'){await run("UPDATE users SET pending_email=NULL WHERE id=?",user.id);await run("DELETE FROM auth_tokens WHERE user_id=? AND type='email'",user.id);return json({ok:true});}
  if(method==='DELETE'&&!p[1]){await rateLimit('delete-account:'+user.id,5,900000);const b=z.object({password:z.string().min(1).max(128)}).parse(await body(req));const account=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(account&&await checkPassword(b.password,account.password_hash),'Your password is incorrect.',403);await deleteAccount(user);return json({ok:true},200,{'Set-Cookie':clearCookie(req)});}
 }
 if(p[0]==='admin')return await adminAPI(req,p,user);
 throw new HttpError(404,'This action could not be found.');
 }catch(e){// The admin stays in English (C10).
 const lang=new URL(req.url).pathname.startsWith('/api/admin')?'en':langFromCookie(req.headers.get('cookie'));if(e instanceof ZodError)return json({error:e.errors.map(x=>fieldMessage(lang,x.path.join('.'),x.message)).join('; ')},400);if(e instanceof HttpError)return json({error:translate(lang,e.message)},e.status);await reportError('api','API request failed',{error:e,context:{method:req.method,path:new URL(req.url).pathname}});return json({error:translate(lang,'Something went wrong. Please try again. Your saved work is safe.')},500);}}

/** An https link to a social profile, or empty to hide it. */
const socialLink=z.union([z.literal(''),z.string().trim().max(200).url().refine(u=>u.startsWith('https://'),'Social links must start with https://.')]);
/** Support staff (V10) may look after customers: users, creations, reports and operations; never money, keys, settings or the catalog. */
function supportMay(method:string,p:string[],url:URL){
 if(p[1]==='users'){if(method==='GET')return true;if(method==='POST'&&p[3]==='reset-link')return true;return false;}
 if(p[1]==='generations')return method==='GET'||method==='POST'&&p[3]==='retry';
 if(p[1]==='reports'||p[1]==='removals'||p[1]==='feed')return true;
 if(p[1]==='operations')return method==='GET'||p[2]==='dispatch';
 return p[1]==='me'&&url.pathname.length>0;
}
async function adminAPI(req:Request,p:string[],user:StudioUser){const method=req.method;
 if(user.role==='support'){const u=new URL(req.url);let ok=supportMay(method,p,u);
  // Support may also mark an email verified or unblock refusals, but not suspend, rename, change roles or delete.
  if(!ok&&p[1]==='users'&&method==='PATCH'&&p[2]&&!p[3]){const b=((await req.clone().json().catch(()=>null))||{}) as Record<string,unknown>;ok=Object.keys(b).length>0&&Object.keys(b).every(k=>k==='emailVerified'||k==='unblock');}
  must(ok,'This needs an administrator. Support accounts can help customers but cannot change money, keys, settings or templates.',403);}
 if(p[1]==='media'){if(method==='POST'&&!p[2])return json(await uploadTemplateMedia(req,user),201);if(method==='GET'&&!p[2])return json(await listTemplateMedia());if(method==='DELETE'&&p[2]){await deleteTemplateMedia(p[2],user);return json({ok:true});}}
 if(p[1]==='workflows'&&p[2]==='preset'&&method==='POST'){const b=z.object({name:z.string().min(2).max(100),slug:z.string().max(120),description:z.string().max(2000),requiredImageCount:z.number().int().min(1).max(4),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']),duration:z.union([z.literal(5),z.literal(10)]),estimatedCost:z.number().int().min(0)}).parse(await body(req));return json(liveWorkflow(b));}
 if(p[1]==='connections'&&p.length===2){if(method==='GET')return json(await connectionStatus());if(method==='PATCH')return json(await updateConnections(req,user));}
 if(p[1]==='operations'&&method==='GET')return json(await operationsSummary());
 if(p[1]==='export'&&p[2]&&method==='GET'){await rateLimit('admin-export:'+user.id,30,3600000);return await adminExport(p[2],user.id);}
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
  // Sell in the pack currencies (ALL/EUR); AI costs are entered in USD and converted with the admin rates (C19).
  const rates=await exchangeRates();
  const selling=(Object.keys(values).length?Object.keys(values):[...new Set(revenue.map(r=>r.currency as string))]);
  const currencies=selling.length?selling:['EUR'];
  const financials=currencies.map(c=>{const r=revenue.find(x=>x.currency===c)||{};return {currency:c,revenue:0,paid_count:0,reversed_count:0,reversed_amount:0,...r,estimated_cost:costs.reduce((sum,row)=>sum+convertMinor(Number(row.estimated_cost||0),row.currency as string,c,rates),0)};});
  // Gross margin per video at the cheapest credit price, with AI cost converted into each selling currency.
  const profitable=currencies.filter(c=>values[c]!==undefined).flatMap(c=>templates.map(t=>({name:t.name as string,currency:c,credit_cost:t.credit_cost as number,estimated_cost:convertMinor(Number(t.estimated_cost||0),t.currency as string,c,rates),value:Math.round((t.credit_cost as number)*values[c])})).sort((a,b)=>(b.value-b.estimated_cost)-(a.value-a.estimated_cost)).slice(0,5));
  return json({users:users?.count||0,metrics,financials,credits,top,recent,profitable,daily,recentPurchases,demo:config().demo,...await publicAvailability()});
 }
 if(p[1]==='announcements'){if(method==='GET'&&!p[2])return json(await listAnnouncements());if(method==='POST'&&p[2]==='test')return json(await sendTest(user,await body(req)));if(method==='POST'&&!p[2])return json(await createAnnouncement(user,await body(req)),201);if(method==='POST'&&p[3]==='cancel')return json(await cancelAnnouncement(user,p[2]));}
 if(p[1]==='ideas'){if(method==='GET'&&!p[2])return json(await adminIdeas());if(method==='PATCH'&&p[2])return json(await updateIdea(user,p[2],await body(req)));}
 if(p[1]==='template-stats'&&method==='GET')return json(await templateStats(new URL(req.url)));
 if(p[1]==='templates'){
  if(method==='GET'&&p[3]==='versions'&&p[2])return json(await listVersions(p[2]));
  if(method==='GET'){if(p[2]){const t=await getAdminTemplate(p[2]);must(t,'Template not found.',404);return json({template:t});}const [t,values,rates]=await Promise.all([all('SELECT * FROM templates ORDER BY sort_order ASC,created_at DESC'),creditValues(),exchangeRates()]);const acct=values['EUR']!==undefined?'EUR':(Object.keys(values)[0]||'EUR');return json({templates:t.map(t=>({...publicTemplate(t),estimatedCost:convertMinor(Number(t.estimated_cost||0),t.currency as string,acct,rates),provider:t.provider,model:t.model,costCurrency:acct,creditValue:values[acct]!==undefined?Math.round((t.credit_cost as number)*values[acct]):null,publishAt:t.publish_at??null,archivedAt:t.archived_at??null}))});}
  if(method==='POST'&&p[2]&&p[3]==='versions'&&p[4]&&p[5]==='restore')return json(await restoreVersion(p[2],p[4],user.id));
  if(method==='POST'&&p[2]&&p[3]==='restore'){const r=await one('UPDATE templates SET archived_at=NULL,updated_at=? WHERE id=? AND archived_at IS NOT NULL RETURNING id',now(),p[2]);must(r,'Only an archived template can be restored.',409);await audit(user.id,'template.restore',p[2]);return json({ok:true});}
  // V13: manual order for the Recommended sort, and bulk publish / unpublish / archive.
  if(method==='POST'&&p[2]==='order'){const b=z.object({ids:z.array(z.string().max(150)).min(1).max(1000)}).parse(await body(req));must(new Set(b.ids).size===b.ids.length,'Each template can appear once.');await batch(b.ids.map((id,i)=>stmt('UPDATE templates SET sort_order=? WHERE id=?',i+1,id)));await audit(user.id,'template.reorder','templates');return json({ok:true});}
  if(method==='POST'&&p[2]==='bulk'){const b=z.object({ids:z.array(z.string().max(150)).min(1).max(500),action:z.enum(['publish','unpublish','archive'])}).parse(await body(req));const failed:{id:string;name:string;error:string}[]=[];let done=0;
   for(const id of b.ids){const t=await getAdminTemplate(id);if(!t||t.archivedAt){failed.push({id,name:t?.name||id,error:'Not found or archived.'});continue;}
    if(b.action==='archive'){await run('UPDATE templates SET archived_at=?,active=0,publish_at=NULL,updated_at=? WHERE id=?',now(),now(),id);done++;continue;}
    const next={...t,active:b.action==='publish',publishAt:null};const check=templateSchema.safeParse(next);if(!check.success){failed.push({id,name:t.name,error:check.error.errors[0]?.message||'Not ready to publish.'});continue;}
    await batch(templateStatements(next,true));done++;}
   await audit(user.id,'template.bulk-'+b.action,String(done));return json({done,failed});}
  if(method==='POST'||method==='PATCH'){
   if(p[3]==='duplicate'){const original=await getAdminTemplate(p[2]);must(original,'Template not found.',404);const suffix=uid().slice(0,6);const t={...original,id:uid('tpl_'),slug:original.slug+'-copy-'+suffix,name:original.name+' (copy)',active:false,publishAt:null,createdAt:now()};await batch(templateStatements(t));await audit(user.id,'template.duplicate',t.id);return json({template:t},201);}
   const b=templateSchema.parse(await body(req));await validateTemplateMedia(b);const existing=p[2]?await getAdminTemplate(p[2]):null;if(method==='PATCH'){must(existing,'Template not found.',404);must(!existing.archivedAt,'Restore this template from the archive first.',409);}must(!await one('SELECT id FROM templates WHERE slug=? AND id!=?',b.slug,existing?.id||''),'This URL slug is already in use.',409);
   const t={...b,id:existing?.id||uid('tpl_'),createdAt:existing?.createdAt||now()} as AdminTemplate;await batch(templateStatements(t,!!existing));await recordVersion(t,user.id);await audit(user.id,existing?'template.update':'template.create',t.id);if(existing){const kept=new Set(templateMediaUrls(t));await releaseTemplateMedia(templateMediaUrls(existing).filter(u=>!kept.has(u)));}return json({template:t},existing?200:201);
  }
  // V14: delete archives the template (hidden everywhere, restorable); only an archived template can be deleted for good.
  if(method==='DELETE'){const existing=await getAdminTemplate(p[2]);must(existing&&existing.id===p[2],'Template not found.',404);
   if(new URL(req.url).searchParams.get('permanent')!=='1'){await run('UPDATE templates SET archived_at=?,active=0,publish_at=NULL,updated_at=? WHERE id=?',now(),now(),p[2]);await audit(user.id,'template.archive',p[2]);return json({ok:true,archived:true});}
   must(existing.archivedAt,'Archive the template before deleting it permanently.',409);await run('DELETE FROM templates WHERE id=?',p[2]);await audit(user.id,'template.delete',p[2]);await releaseTemplateMedia(templateMediaUrls(existing));return json({ok:true});}
 }
 if(p[1]==='feed'&&p[3]==='hide'&&method==='POST')return json(await hideFromFeed(user,p[2]));
 if(p[1]==='removals'){if(method==='GET'&&!p[2])return json(await listRemovals(new URL(req.url)));if(method==='POST'&&p[3]==='resolve')return json(await resolveRemoval(user,p[2],await body(req)));}
 if(p[1]==='reports'){
  if(method==='GET'&&!p[2])return json(await listReports(new URL(req.url)));
  if(method==='GET'&&p[2]&&!p[3])return json(await reportDetail(p[2]));
  if(method==='POST'&&p[2]&&p[3]==='resolve')return json(await resolveReport(user,p[2],await body(req)));
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
  if(method==='GET'&&p[2]&&!p[3])return json(await adminUserDetail(p[2]));
  // V11: send the customer a password reset link (in their language); in the demo without email, the link is shown to the admin instead.
  if(method==='POST'&&p[3]==='reset-link'){await rateLimit('admin-reset:'+user.id,20,3600000);const target=await one('SELECT id,email,status,locale FROM users WHERE id=?',p[2]);must(target,'User not found.',404);must(target.status==='active','Reactivate the account before sending a reset link.',409);const c=await serviceConfig();const token=await makeAuthToken(target.id as string,'reset');await audit(user.id,'user.reset-link',target.id as string);if(c.mailKey&&c.mailFrom){await sendAuthMail(target.email as string,token,'reset',target.locale==='en'?'en':'sq');return json({sent:true});}must(c.demo,'Email delivery is not configured. Add it in Connections first.',503);return json({sent:false,url:`${c.origin}/reset-password?token=${token}`});}
  if(method==='GET'&&p[3]==='purchases'){must(await one('SELECT id FROM users WHERE id=?',p[2]),'User not found.',404);return json(await listPurchases(p[2],new URL(req.url)));}
  if(method==='PATCH'){const b=z.object({status:z.enum(['active','suspended']).optional(),name:z.string().trim().min(2).max(80).optional(),emailVerified:z.literal(true).optional(),unblock:z.literal(true).optional(),role:z.enum(['user','support','admin']).optional(),currentPassword:z.string().min(1).max(128).optional()}).strict().parse(await body(req));
   const target=await one('SELECT id,role,email_verified FROM users WHERE id=?',p[2]);must(target,'User not found.',404);must(b.status||b.name||b.emailVerified||b.unblock||b.role,'Choose something to change.');
   // V10: only an administrator changes roles, never their own, with their password, and the studio always keeps one administrator.
   if(b.role&&b.role!==target.role){must(user.role==='admin','This needs an administrator.',403);must(target.id!==user.id,'You can’t change your own role.',409);const me=await one('SELECT password_hash FROM users WHERE id=?',user.id);must(b.currentPassword&&me&&await checkPassword(b.currentPassword,me.password_hash),'Your administrator password is incorrect.',403);if(target.role==='admin'){const others=await one("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active' AND id!=?",target.id);must(Number(others?.n||0)>0,'The studio needs at least one administrator.',409);}await batch([stmt('UPDATE users SET role=? WHERE id=?',b.role,target.id),stmt('DELETE FROM sessions WHERE user_id=?',target.id)]);await audit(user.id,'user.role-'+b.role,target.id as string);}
   if(b.status){must(!isStaff(target.role as string),'Staff accounts cannot be suspended here. Change the role to customer first.',409);await batch([stmt('UPDATE users SET status=? WHERE id=?',b.status,p[2]),...(b.status==='suspended'?[stmt('DELETE FROM sessions WHERE user_id=?',p[2])]:[])]);await audit(user.id,'user.'+b.status,p[2]);}
   if(b.name){await run('UPDATE users SET name=? WHERE id=?',b.name,p[2]);await audit(user.id,'user.rename',p[2]);}
   // Unblocking also resets the refusal count, for photos the provider flagged by mistake.
   if(b.unblock){await run('UPDATE users SET content_strikes=0,blocked_at=NULL WHERE id=?',p[2]);await audit(user.id,'user.unblock',p[2]);}
   // Marking an email verified by hand behaves like opening the verification link, including welcome credits.
   if(b.emailVerified&&!target.email_verified){await batch([stmt('UPDATE users SET email_verified=1 WHERE id=?',p[2]),stmt("DELETE FROM auth_tokens WHERE user_id=? AND type='verify'",p[2])]);await grantWelcomeCredits(p[2]).catch(e=>reportError('credits','Welcome credits need review',{error:e}));await audit(user.id,'user.verify-email',p[2]);}
   return json({ok:true});}
  if(method==='DELETE'){const u=await one('SELECT * FROM users WHERE id=?',p[2]);must(u,'User not found.',404);await deleteAccount(safeUser(u));await audit(user.id,'user.delete',p[2]);return json({ok:true});}
 }
 if(p[1]==='providers'){
  if(method==='GET'){const list=await all('SELECT * FROM provider_configurations');const c=await serviceConfig();return json({providers:list.map(p=>({...p,configured:providerConfigured(p.id,c)})),demo:c.demo});}
  if(method==='PATCH'){const b=await body(req);const enabled=z.boolean().parse(b.enabled);must(['mock','higgsfield','fal','replicate'].includes(p[2]),'Unknown provider.');await run('UPDATE provider_configurations SET enabled=?,updated_at=? WHERE id=?',Number(enabled),now(),p[2]);await audit(user.id,'provider.update',p[2]);return json({ok:true});}
 }
 if(p[1]==='settings'){
  if(method==='GET'){const welcome=await one("SELECT value FROM app_settings WHERE key='welcome_credits'");const c=await serviceConfig();return json({welcomeCredits:Number(welcome?.value||0),photoGuidelines:await photoGuidelines(),support:await supportInfo(),demo:c.demo,paymentsConfigured:!!c.pokKeyId&&!!c.pokKeySecret&&!!c.pokMerchantId,emailConfigured:!!c.mailKey&&!!c.mailFrom,queueConfigured:!!c.cronSecret,dispatcher:await dispatcherStatus(),maintenance:await maintenanceStatus(),limits:await spendingLimits(),exchangeRates:await exchangeRates()});}
  if(method==='PATCH'){const line=z.string().max(160);const b=z.object({welcomeCredits:z.number().int().min(0).max(100000).optional(),photoGuidelines:z.object({do:z.array(line).max(12),dont:z.array(line).max(12)}).optional(),maintenance:z.object({purchasesPaused:z.boolean(),creationsPaused:z.boolean(),message:z.string().trim().max(300)}).optional(),limits:z.object({concurrent:z.number().int().min(0).max(100),daily:z.number().int().min(0).max(1000),studioDailyCost:z.number().int().min(0).max(1000000000)}).optional(),exchangeRates:z.object({EUR:z.number().positive().max(100000),ALL:z.number().positive().max(100000)}).optional(),support:z.object({email:z.union([z.literal(''),z.string().trim().email().max(120)]),phone:z.string().trim().max(40).regex(/^[+\d ()-]*$/,'Use digits, spaces and + only for the phone number.'),responseTime:z.string().trim().max(120),instagram:socialLink,tiktok:socialLink,facebook:socialLink,reviewUrl:socialLink.default('')}).optional()}).parse(await body(req));
   if(b.support){await run("INSERT INTO app_settings (key,value) VALUES ('support_info',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(b.support));await audit(user.id,'settings.update','support_info');}
   if(b.welcomeCredits!==undefined){await run("INSERT INTO app_settings (key,value) VALUES ('welcome_credits',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(b.welcomeCredits));await audit(user.id,'settings.update','welcome_credits');}
   if(b.photoGuidelines){const value={do:cleanGuidelineList(b.photoGuidelines.do),dont:cleanGuidelineList(b.photoGuidelines.dont)};must(value.do.length&&value.dont.length,'Add at least one “do” and one “don’t” guideline.');await run("INSERT INTO app_settings (key,value) VALUES ('photo_guidelines',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(value));await audit(user.id,'settings.update','photo_guidelines');}
   if(b.maintenance){const up=(k:string,v:string)=>run("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",k,v);await up('maintenance_purchases',b.maintenance.purchasesPaused?'1':'0');await up('maintenance_creations',b.maintenance.creationsPaused?'1':'0');await up('maintenance_message',b.maintenance.message);await audit(user.id,'settings.update','maintenance');}
   if(b.limits){const up=(k:string,v:number)=>run("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",k,String(v));await up('limit_user_concurrent',b.limits.concurrent);await up('limit_user_daily',b.limits.daily);await up('limit_studio_daily_cost',b.limits.studioDailyCost);await audit(user.id,'settings.update','limits');}
   if(b.exchangeRates){const up=(k:string,v:number)=>run("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",k,String(v));await up('rate_usd_eur',b.exchangeRates.EUR);await up('rate_usd_all',b.exchangeRates.ALL);await audit(user.id,'settings.update','exchange_rates');}
   return json({ok:true});}
 }
 throw new HttpError(404,'Admin action not found.');
}
