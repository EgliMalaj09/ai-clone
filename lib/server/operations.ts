import {serviceConfig} from './connections';
import {z} from 'zod';
import type {StudioUser} from '../contracts';
import {all,audit,batch,config,HttpError,must,now,one,run,runtime,stmt} from './data';
import {jsonBody,pageQuery} from './http';
import {checkPassword,hash,passwordHash,rateLimit,sessionCookie} from './security';

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
    const [uploads,generations,orders,favorites]=await Promise.all([
      all('SELECT id,name,mime,size,created_at FROM user_uploads WHERE user_id=?',user.id),
      all('SELECT id,template_name,status,price,currency,created_at,completed_at FROM generations WHERE user_id=? AND deleted_at IS NULL',user.id),
      all('SELECT id,template_name,amount,currency,status,created_at FROM orders WHERE user_id=?',user.id),
      all('SELECT template_id,created_at FROM favorites WHERE user_id=?',user.id),
    ]);
    await audit(user.id,'account.exported',user.id);
    return response({exportedAt:new Date().toISOString(),profile:user,uploads,generations,orders,favorites},{'Content-Disposition':'attachment; filename="project-studio-account.json"'});
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
    const users=await all('SELECT u.id,u.email,u.name,u.role,u.status,u.email_verified,u.created_at,(SELECT COUNT(*) FROM generations g WHERE g.user_id=u.id) AS generation_count,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count FROM users u'+filter+' ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?',...args,limit,offset);
    const spending=users.length?await all("SELECT user_id,currency,SUM(amount) AS amount FROM orders WHERE status='paid' AND user_id IN ("+users.map(()=>'?').join(',')+') GROUP BY user_id,currency',...users.map(u=>u.id)):[];
    return {users:users.map(u=>({...u,spending:spending.filter(s=>s.user_id===u.id)})),pagination:pageInfo(count?.total||0,page,limit)};
  }
  if(kind==='generations'){
    if(search){where.push("(g.id LIKE ? ESCAPE '\\' OR g.template_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");args.push(like(search),like(search),like(search));}
    if(status!=='all'){must(['awaiting_payment','queued','preparing','generating','finalizing','completed','failed'].includes(status),'Unknown generation status.');where.push('g.status=?');args.push(status);}
    const from=' FROM generations g LEFT JOIN users u ON u.id=g.user_id'+(where.length?' WHERE '+where.join(' AND '):'');
    const count=await one('SELECT COUNT(*) AS total'+from,...args);
    const generations=await all('SELECT g.id,g.user_id,g.template_name,g.price,g.currency,g.estimated_cost,g.status,g.created_at,g.started_at,g.completed_at,g.error,g.internal_error,g.deleted_at,u.email'+from+' ORDER BY g.created_at DESC,g.id LIMIT ? OFFSET ?',...args,limit,offset);
    return {generations,pagination:pageInfo(count?.total||0,page,limit)};
  }
  if(search){where.push("(o.id LIKE ? ESCAPE '\\' OR o.template_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR p.provider_transaction_id LIKE ? ESCAPE '\\')");args.push(...Array(4).fill(like(search)));}
  if(status!=='all'){
    must(['pending','paid','failed','refunded','refund-review'].includes(status),'Unknown payment status.');
    if(status==='refund-review')where.push("r.status IN ('failed','pending','requires_action')");
    else {where.push('p.status=?');args.push(status);}
  }
  const from=' FROM orders o LEFT JOIN users u ON u.id=o.user_id JOIN generations g ON g.id=o.generation_id JOIN payments p ON p.order_id=o.id LEFT JOIN refunds r ON r.payment_id=p.id'+(where.length?' WHERE '+where.join(' AND '):'');
  const count=await one('SELECT COUNT(*) AS total'+from,...args);
  const orders=await all('SELECT o.*,u.email,g.status AS generation_status,p.id AS payment_id,p.provider,p.provider_session_id,p.provider_transaction_id,p.status AS payment_status,r.status AS refund_status,r.error AS refund_error'+from+' ORDER BY o.created_at DESC,o.id LIMIT ? OFFSET ?',...args,limit,offset);
  return {orders,pagination:pageInfo(count?.total||0,page,limit)};
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
  const [queue,refunds,stalled,unpaid,heartbeat,dispatch,storageUsage,events,failures]=await Promise.all([
    all("SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest FROM generations WHERE deleted_at IS NULL GROUP BY status"),
    all("SELECT r.id,r.amount,r.status,r.error,r.created_at,o.id AS order_id,o.currency,u.email FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.user_id WHERE r.status!='succeeded' ORDER BY r.created_at LIMIT 20"),
    all("SELECT id,template_name,status,started_at,created_at,internal_error FROM generations WHERE status IN ('queued','preparing','generating','finalizing') AND deleted_at IS NULL AND COALESCE(started_at,created_at)<? ORDER BY created_at LIMIT 20",now()-10*60000),
    one("SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending','failed')"),
    one("SELECT value FROM app_settings WHERE key='queue_heartbeat'"),
    one("SELECT value FROM app_settings WHERE key='queue_dispatch_heartbeat'"),
    one('SELECT (SELECT COALESCE(SUM(size),0) FROM user_uploads)+(SELECT COALESCE(SUM(size),0) FROM generated_assets)+(SELECT COALESCE(SUM(size),0) FROM template_media) AS bytes,(SELECT COUNT(*) FROM user_uploads) AS uploads,(SELECT COUNT(*) FROM generated_assets) AS assets,(SELECT COUNT(*) FROM template_media) AS previews'),
    all('SELECT name,COUNT(*) AS count FROM analytics_events WHERE created_at>=? GROUP BY name ORDER BY count DESC',now()-30*86400000),
    all("SELECT g.id,g.template_name,g.error,g.internal_error,g.completed_at,o.status AS payment_status FROM generations g JOIN orders o ON o.generation_id=g.id WHERE g.status='failed' AND g.deleted_at IS NULL ORDER BY g.completed_at DESC LIMIT 10"),
  ]);
  const checks=[
    {name:'Database',ready:true,detail:'Connected'},
    {name:'Private file storage',ready:!!runtime().BUCKET,detail:runtime().BUCKET?'Connected':'Storage binding missing'},
    {name:'Application signing key',ready:c.secret.length>=32,detail:c.secret.length>=32?'Configured':'Missing'},
    {name:'Payments',ready:!!c.stripeKey&&!!c.webhookSecret,detail:c.demo?'Test checkout active':c.stripeKey&&c.webhookSecret?'Stripe keys configured; verify webhook delivery in Stripe':'Stripe secret or webhook secret missing'},
    {name:'Transactional email',ready:!!c.mailKey&&!!c.mailFrom,detail:c.mailKey&&c.mailFrom?'Sender configured; verify delivery with your email service':'Email credentials or sender missing'},
    {name:'AI generation',ready:!!c.falKey||!!c.replicateKey,detail:c.demo?'Sample video simulator active':c.falKey||c.replicateKey?'Provider credentials configured':'Provider credentials missing'},
    {name:'External queue dispatcher',ready:!!c.cronSecret&&Number(dispatch?.value)>now()-180000,detail:dispatch?.value?'Last external tick: '+new Date(Number(dispatch.value)).toISOString():'No external dispatcher call recorded'},
  ];
  return {demo:c.demo,checkedAt:now(),queue,refunds,stalled,unpaid:unpaid?.count||0,heartbeat:Number(heartbeat?.value)||null,dispatchHeartbeat:Number(dispatch?.value)||null,storage:storageUsage,checks,events,failures};
}
