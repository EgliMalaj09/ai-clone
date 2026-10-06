import {serviceConfig} from './connections';
import {z} from 'zod';
import type {StudioUser} from '../contracts';
import {all,audit,batch,HttpError,must,now,one,run,runtime,stmt} from './data';
import {jsonBody,pageQuery} from './http';
import {balanceOf,reconcileCredits} from './credits';
import {checkPassword,hash,passwordHash,rateLimit,sessionCookie} from './security';
import {dispatcherStatus} from './dispatcher';

const response=(data:unknown,headers:Record<string,string>={})=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const pageInfo=(total:number,page:number,limit:number)=>({total,page,limit,pages:Math.max(1,Math.ceil(total/limit))});
const searchTerm=(url:URL)=>(url.searchParams.get('search')||'').trim().slice(0,150);
const like=(value:string)=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%';

export async function accountSecurity(req:Request,path:string[],user:StudioUser){
  await rateLimit('account-security:'+user.id,20);
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1]||'';
  const currentHash=await hash(token);
  if(path[1]==='sessions'&&req.method==='GET'){
    const sessions=await all('SELECT token_hash,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at DESC',user.id,now());
    return response({sessions:sessions.map(s=>({current:s.token_hash===currentHash,expiresAt:s.expires_at}))});
  }
  if(path[1]==='sessions'&&req.method==='DELETE'){
    await run('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',user.id,currentHash);
    await audit(user.id,'account.sessions-revoked',user.id);
    return response({ok:true});
  }
  if(path[1]==='password'&&req.method==='POST'){
    await rateLimit('change-password:'+user.id,5,900000);
    const b=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(10,'Use at least 10 characters.').max(128)}).parse(await jsonBody(req));
    must(b.currentPassword!==b.newPassword,'Choose a different password.');
    const record=await one('SELECT password_hash FROM users WHERE id=?',user.id);
    must(record&&await checkPassword(b.currentPassword,record.password_hash),'Your current password is incorrect.',403);
    const changed=await one('UPDATE users SET password_hash=? WHERE id=? AND password_hash=? RETURNING id',await passwordHash(b.newPassword),user.id,record.password_hash);
    must(changed,'Your password was already changed. Sign in again.',409);
    await batch([stmt('DELETE FROM sessions WHERE user_id=?',user.id),stmt("DELETE FROM auth_tokens WHERE user_id=? AND type='reset'",user.id)]);
    await audit(user.id,'account.password-changed',user.id);
    return response({ok:true},{'Set-Cookie':await sessionCookie(user.id,req)});
  }
  if(path[1]==='export'&&req.method==='GET'){
    await rateLimit('account-export:'+user.id,3,3600000);
    const [uploads,generations,purchases,favorites,credits,creditTransactions]=await Promise.all([
      all('SELECT id,name,mime,size,created_at FROM user_uploads WHERE user_id=?',user.id),
      all('SELECT id,template_name,status,credit_cost,created_at,completed_at FROM generations WHERE user_id=? AND deleted_at IS NULL',user.id),
      all('SELECT id,package_name,credits,amount,currency,status,created_at,paid_at FROM credit_purchases WHERE user_id=?',user.id),
      all('SELECT template_id,created_at FROM favorites WHERE user_id=?',user.id),
      balanceOf(user.id),
      all("SELECT t.id,t.kind,t.reason,t.created_at,e.amount FROM credit_transactions t JOIN credit_entries e ON e.transaction_id=t.id AND e.account='user:'||t.user_id||':available' WHERE t.user_id=? ORDER BY t.created_at",user.id),
    ]);
    await audit(user.id,'account.exported',user.id);
    return response({exportedAt:new Date().toISOString(),profile:user,uploads,generations,creditPurchases:purchases,favorites,credits:{...credits,transactions:creditTransactions}},{'Content-Disposition':'attachment; filename="project-studio-account.json"'});
  }
  throw new HttpError(404,'Account action not found.');
}

export async function adminRecords(kind:string,url:URL){
  const {page,limit,offset}=pageQuery(url);
  const search=searchTerm(url),status=url.searchParams.get('status')||'all',user=url.searchParams.get('user');
  const where:string[]=[],args:unknown[]=[];
  if(user){where.push('u.email=?');args.push(user.slice(0,254));}
  if(kind==='users'){
    if(search){where.push("(u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')");args.push(like(search),like(search));}
    if(status!=='all'){must(['active','suspended'].includes(status),'Unknown account status.');where.push('u.status=?');args.push(status);}
    const filter=where.length?' WHERE '+where.join(' AND '):'';
    const count=await one('SELECT COUNT(*) AS total FROM users u'+filter,...args);
    const users=await all('SELECT u.id,u.email,u.name,u.role,u.status,u.email_verified,u.created_at,u.content_strikes,u.blocked_at,(SELECT COUNT(*) FROM generations g WHERE g.user_id=u.id) AS generation_count,(SELECT COUNT(*) FROM credit_purchases p WHERE p.user_id=u.id AND p.status=\'paid\') AS purchase_count,COALESCE((SELECT available FROM credit_balances b WHERE b.user_id=u.id),0) AS credits FROM users u'+filter+' ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?',...args,limit,offset);
    const spending=users.length?await all("SELECT user_id,currency,SUM(amount) AS amount FROM credit_purchases WHERE status='paid' AND user_id IN ("+users.map(()=>'?').join(',')+') GROUP BY user_id,currency',...users.map(u=>u.id)):[];
    return {users:users.map(u=>({...u,spending:spending.filter(s=>s.user_id===u.id)})),pagination:pageInfo(count?.total||0,page,limit)};
  }
  if(kind==='generations'){
    if(search){where.push("(g.id LIKE ? ESCAPE '\\' OR g.template_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");args.push(like(search),like(search),like(search));}
    if(status!=='all'){must(['queued','preparing','generating','finalizing','completed','failed','refused'].includes(status),'Unknown generation status.');where.push('g.status=?');args.push(status);}
    const from=' FROM generations g LEFT JOIN users u ON u.id=g.user_id'+(where.length?' WHERE '+where.join(' AND '):'');
    const count=await one('SELECT COUNT(*) AS total'+from,...args);
    const generations=await all('SELECT g.id,g.user_id,g.template_name,g.credit_cost,g.currency,g.estimated_cost,g.status,g.created_at,g.started_at,g.completed_at,g.error,g.internal_error,g.deleted_at,u.email'+from+' ORDER BY g.created_at DESC,g.id LIMIT ? OFFSET ?',...args,limit,offset);
    return {generations,pagination:pageInfo(count?.total||0,page,limit)};
  }
  throw new HttpError(404,'Unknown record type.');
}

export async function adminActivity(url:URL){
  const {page,limit,offset}=pageQuery(url,25),search=searchTerm(url);
  const filter=search?" WHERE a.action LIKE ? ESCAPE '\\' OR a.target_id LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'":'';
  const args=search?[like(search),like(search),like(search)]:[];
  const from=' FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id';
  const count=await one('SELECT COUNT(*) AS total'+from+filter,...args);
  const activity=await all('SELECT a.id,a.action,a.target_id,a.created_at,u.email'+from+filter+' ORDER BY a.created_at DESC,a.id LIMIT ? OFFSET ?',...args,limit,offset);
  return {activity,pagination:pageInfo(count?.total||0,page,limit)};
}

export async function operationsSummary(){
  const c=await serviceConfig();
  const [queue,reversals,stalled,heartbeat,dispatch,storageUsage,events,failures,ledger,credits]=await Promise.all([
    all("SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest FROM generations WHERE deleted_at IS NULL GROUP BY status"),
    all("SELECT p.id,p.package_name,p.credits,p.amount,p.currency,p.created_at,u.email,COALESCE(b.available,0) AS balance FROM credit_purchases p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN credit_balances b ON b.user_id=p.user_id WHERE p.status='reversed' ORDER BY p.created_at DESC LIMIT 20"),
    all("SELECT id,template_name,status,started_at,created_at,internal_error FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL AND COALESCE(started_at,created_at)<? ORDER BY created_at LIMIT 20",now()-10*60000),
    one("SELECT value FROM app_settings WHERE key='queue_heartbeat'"),
    dispatcherStatus(),
    one('SELECT (SELECT COALESCE(SUM(size),0) FROM user_uploads)+(SELECT COALESCE(SUM(size),0) FROM generated_assets)+(SELECT COALESCE(SUM(size),0) FROM template_media) AS bytes,(SELECT COUNT(*) FROM user_uploads) AS uploads,(SELECT COUNT(*) FROM generated_assets) AS assets,(SELECT COUNT(*) FROM template_media) AS previews'),
    all('SELECT name,COUNT(*) AS count FROM analytics_events WHERE created_at>=? GROUP BY name ORDER BY count DESC',now()-30*86400000),
    all("SELECT g.id,g.template_name,g.error,g.internal_error,g.completed_at,h.status AS credit_status FROM generations g LEFT JOIN credit_holds h ON h.id=g.hold_id WHERE g.status='failed' AND g.deleted_at IS NULL ORDER BY g.completed_at DESC LIMIT 10"),
    reconcileCredits(),
    one('SELECT COALESCE(SUM(available),0) AS available,COALESCE(SUM(held),0) AS held FROM credit_balances'),
  ]);
  const checks=[
    {name:'Database',ready:true,detail:'Connected'},
    {name:'Private file storage',ready:!!runtime().BUCKET,detail:runtime().BUCKET?'Connected':'Storage binding missing'},
    {name:'Application signing key',ready:c.secret.length>=32,detail:c.secret.length>=32?'Configured':'Missing'},
    {name:'Payments',ready:!!c.pokKeyId&&!!c.pokKeySecret&&!!c.pokMerchantId,detail:c.demo?'Test credit checkout active':c.pokKeyId&&c.pokKeySecret&&c.pokMerchantId?`POK keys configured (${c.pokEnvironment==='production'?'real payments':'staging test payments'}); verify a purchase end to end`:'POK key ID, key secret or merchant ID missing'},
    {name:'Transactional email',ready:!!c.mailKey&&!!c.mailFrom,detail:c.mailKey&&c.mailFrom?'Sender configured; verify delivery with your email service':'Email credentials or sender missing'},
    {name:'AI generation',ready:!!(c.higgsfieldKey&&c.higgsfieldSecret)||!!c.falKey||!!c.replicateKey,detail:c.demo?'Sample video simulator active':c.higgsfieldKey&&c.higgsfieldSecret?'Higgsfield credentials configured; watch your Higgsfield credit balance':c.falKey||c.replicateKey?'Provider credentials configured':'Higgsfield key ID and secret missing'},
    {name:'Credit ledger',ready:ledger.ok,detail:ledger.ok?(ledger.negative.length?ledger.negative.length+' account(s) below zero after a reversed payment':'Balances match the ledger'):'Ledger mismatch: review Admin → Credits'},
    {name:'Background dispatcher',ready:dispatch.fresh,detail:dispatch.at?(dispatch.fresh?'Running':'Stopped')+' · last run '+new Date(dispatch.at).toISOString()+' by '+(dispatch.source==='cron'?'the every-minute cron trigger':'an external scheduler'):'No dispatcher run recorded. The live Worker runs it every minute through its cron trigger.'},
  ];
  return {demo:c.demo,checkedAt:now(),queue,reversals,stalled,credits:{available:Number(credits?.available||0),held:Number(credits?.held||0)},heartbeat:Number(heartbeat?.value)||null,dispatchHeartbeat:dispatch.at,dispatchSource:dispatch.source,storage:storageUsage,checks,events,failures};
}
