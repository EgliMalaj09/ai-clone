// Customer reports on finished videos and the admin decision (C21, from policy D12).
// A report on a video made from a good photo earns one free goodwill redo; an unsuitable photo does not.
import {all,audit,config,event,getAdminTemplate,must,now,one,parse,run,stmt,uid,type Row} from './data';
import {grant,placeHold,SYSTEM} from './credits';
import {sendMail} from './security';
import {reportMailContent} from './email-templates';
import {pageQuery} from './http';
import {z} from 'zod';
import type {StudioUser} from '../contracts';

export const REPORT_REASONS=['wrong_face','glitches','mismatch','other'] as const;
const REPORT_WINDOW_MS=7*86400000;
const ABUSE_THRESHOLD=4;// a customer with this many reports is flagged for review

const reportSchema=z.object({reason:z.enum(REPORT_REASONS),comment:z.string().trim().max(1000).optional().default('')});
const resolveSchema=z.object({
 decision:z.enum(['approve','reject_photo','reject_other']),
 guideline:z.string().trim().max(200).optional(),
 reason:z.string().trim().max(500).optional(),
});

/** A finished video has an unresolved report. Used to keep its files until the case closes (C21.6). */
export async function hasOpenReport(generationId:string){return !!await one("SELECT id FROM generation_reports WHERE generation_id=? AND status='open'",generationId);}
/** Whether the customer has any open report (blocks account deletion so evidence is kept). */
export async function userHasOpenReport(userId:string){return !!await one("SELECT id FROM generation_reports WHERE user_id=? AND status='open'",userId);}
/** Upload ids that belong to a generation with an open report, so they are kept until the case closes. */
export async function uploadsLockedByReport(userId:string){
 const rows=await all("SELECT g.input_ids FROM generation_reports r JOIN generations g ON g.id=r.generation_id WHERE r.user_id=? AND r.status='open'",userId);
 return new Set(rows.flatMap(r=>parse<string[]>(r.input_ids,[])));
}

/** Customer-facing report summary for a set of generations (shown on My creations). */
export async function reportsForGenerations(ids:string[]){
 if(!ids.length)return new Map<string,Row>();
 const rows=await all(`SELECT * FROM generation_reports WHERE generation_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at DESC`,...ids);
 const map=new Map<string,Row>();
 for(const r of rows)if(!map.has(r.generation_id as string))map.set(r.generation_id as string,r);
 return map;
}
export const publicReport=(r:Row)=>({status:r.status as string,resolution:r.resolution??null,reason:r.reason as string,guideline:r.guideline??null,adminReason:r.admin_reason??null,createdAt:r.created_at as number});

export async function createReport(user:StudioUser,generationId:string,input:unknown){
 const b=reportSchema.parse(input);
 const g=await one('SELECT * FROM generations WHERE id=? AND user_id=? AND deleted_at IS NULL',generationId,user.id);
 must(g,'Creation not found.',404);
 must(g.status==='completed','You can only report a finished video.',409);
 must(g.completed_at&&now()-Number(g.completed_at)<=REPORT_WINDOW_MS,'Reports can be submitted within 7 days of delivery.',409);
 must(!await one("SELECT id FROM generation_reports WHERE generation_id=? AND status='open'",generationId),'This video already has an open report under review.',409);
 const id=uid('rpt_');
 await run('INSERT INTO generation_reports (id,generation_id,user_id,reason,comment,status,created_at) VALUES (?,?,?,?,?,?,?)',id,generationId,user.id,b.reason,b.comment,'open',now());
 await event('report_created',user.id,{reportId:id,generationId,reason:b.reason});
 return {report:publicReport((await one('SELECT * FROM generation_reports WHERE id=?',id))!)};
}

/** Admin queue: one row per case with the customer and their report history count. */
export async function listReports(url:URL){
 const {page,limit,offset}=pageQuery(url,20);
 const status=url.searchParams.get('status')||'open';
 const filter=['open','approved','rejected'].includes(status)?' WHERE r.status=?':'';
 const args=filter?[status]:[];
 const count=await one(`SELECT COUNT(*) AS total FROM generation_reports r${filter}`,...args);
 const rows=await all(`SELECT r.*,g.template_name,g.thumbnail,g.status AS generation_status,u.email,(SELECT COUNT(*) FROM generation_reports r2 WHERE r2.user_id=r.user_id) AS user_report_count
  FROM generation_reports r JOIN generations g ON g.id=r.generation_id LEFT JOIN users u ON u.id=r.user_id${filter} ORDER BY r.status='open' DESC,r.created_at DESC LIMIT ? OFFSET ?`,...args,limit,offset);
 return {reports:rows.map(adminReportRow),pagination:{total:Number(count?.total||0),page,limit,pages:Math.max(1,Math.ceil(Number(count?.total||0)/limit))}};
}
const adminReportRow=(r:Row)=>({id:r.id as string,generationId:r.generation_id as string,templateName:r.template_name as string,thumbnail:r.thumbnail as string,
 reason:r.reason as string,comment:r.comment as string,status:r.status as string,resolution:r.resolution??null,guideline:r.guideline??null,adminReason:r.admin_reason??null,
 redoGenerationId:r.redo_generation_id??null,email:r.email??null,userReportCount:Number(r.user_report_count||0),flagged:Number(r.user_report_count||0)>=ABUSE_THRESHOLD,
 createdAt:r.created_at as number,resolvedAt:r.resolved_at??null});

/** Full case detail: the video, the uploaded photo(s), and the customer's report history. */
export async function reportDetail(id:string){
 const r=await one('SELECT * FROM generation_reports WHERE id=?',id);must(r,'Report not found.',404);
 const g=await one('SELECT * FROM generations WHERE id=?',r.generation_id);must(g,'Creation not found.',404);
 const asset=await one("SELECT id FROM generated_assets WHERE generation_id=? AND kind='output'",g.id);
 const photos=parse<string[]>(g.input_ids,[]).map(p=>'/api/media/'+p);
 const history=await all('SELECT id,generation_id,reason,status,resolution,created_at FROM generation_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 20',r.user_id);
 const redo=r.redo_generation_id?await one('SELECT id,status FROM generations WHERE id=?',r.redo_generation_id):null;
 return {report:adminReportRow({...r,template_name:g.template_name,thumbnail:g.thumbnail}),
  video:asset?'/api/media/'+asset.id:null,photos,templateName:g.template_name as string,generationStatus:g.status as string,
  history:history.map(h=>({id:h.id,generationId:h.generation_id,reason:h.reason,status:h.status,resolution:h.resolution??null,createdAt:h.created_at})),
  redo:redo?{id:redo.id,status:redo.status}:null};
}

export async function resolveReport(admin:StudioUser,id:string,input:unknown){
 const b=resolveSchema.parse(input);
 const r=await one("SELECT * FROM generation_reports WHERE id=? AND status='open'",id);
 must(r,'This report is not open.',409);
 const og=await one('SELECT * FROM generations WHERE id=?',r.generation_id);must(og,'Creation not found.',404);
 const brand=config().brandName,origin=config().origin,support=config().mailFrom||undefined;
 const email=og.user_id?(await one('SELECT email FROM users WHERE id=?',og.user_id))?.email as string|undefined:undefined;

 if(b.decision==='approve'){
  let amount=Number(og.credit_cost)||0;
  if(amount<=0){const t=await getAdminTemplate(og.template_id as string);amount=t?.creditCost||0;}
  must(amount>0,'This video has no credit cost, so there is nothing to redo for free.',409);
  const redoId=uid('gen_'),created=now();
  // Fund the redo with goodwill credits so it flows through the normal hold/capture path and shows in the ledger.
  await grant({userId:og.user_id as string,amount,kind:'goodwill',key:'goodwill:'+r.id,source:SYSTEM.promo,referenceType:'report',referenceId:r.id as string,actorId:admin.id,reason:'Goodwill redo'});
  const hold=await placeHold({userId:og.user_id as string,amount,generationId:redoId,key:'redo:'+r.id,extra:(holdId,tx)=>{
   const guard={sql:'EXISTS (SELECT 1 FROM credit_transactions WHERE id=?)',args:[tx]};
   return [stmt(`INSERT INTO generations (id,user_id,template_id,template_name,template_slug,thumbnail,status,currency,estimated_cost,credit_cost,hold_id,workflow_snapshot,input_ids,report_id,next_run_at,created_at) SELECT ?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`,
    redoId,og.user_id,og.template_id,og.template_name,og.template_slug,og.thumbnail,og.currency,og.estimated_cost,amount,holdId,og.workflow_snapshot,og.input_ids,r.id,created,created,...guard.args)];
  }});
  must(hold.applied,'Could not start the free redo. Please try again.',409);
  await run("UPDATE generation_reports SET status='approved',resolution='generation_problem',redo_generation_id=?,resolved_at=?,resolved_by=? WHERE id=?",redoId,now(),admin.id,id);
  await event('report_approved',admin.id,{reportId:id,generationId:r.generation_id,redoGenerationId:redoId});
  await audit(admin.id,'report.approve',id);
  if(email)await sendMail(email,reportMailContent('approved',{brand,templateName:og.template_name as string,link:origin+'/creations',linkLabel:'See my creations',supportEmail:support}),'report-'+id);
  return {ok:true,redoGenerationId:redoId};
 }
 if(b.decision==='reject_photo'){
  must(b.guideline,'Choose which photo guideline was not met.');
  await run("UPDATE generation_reports SET status='rejected',resolution='photo_unsuitable',guideline=?,resolved_at=?,resolved_by=? WHERE id=?",b.guideline,now(),admin.id,id);
  await event('report_rejected',admin.id,{reportId:id,resolution:'photo_unsuitable'});await audit(admin.id,'report.reject',id);
  if(email)await sendMail(email,reportMailContent('rejected_photo',{brand,templateName:og.template_name as string,detail:b.guideline,link:origin+'/terms#photos',linkLabel:'Photo tips',supportEmail:support}),'report-'+id);
  return {ok:true};
 }
 // reject_other
 must(b.reason,'Add a short reason the customer will see.');
 await run("UPDATE generation_reports SET status='rejected',resolution='other',admin_reason=?,resolved_at=?,resolved_by=? WHERE id=?",b.reason,now(),admin.id,id);
 await event('report_rejected',admin.id,{reportId:id,resolution:'other'});await audit(admin.id,'report.reject',id);
 if(email)await sendMail(email,reportMailContent('rejected_other',{brand,templateName:og.template_name as string,detail:b.reason,supportEmail:support}),'report-'+id);
 return {ok:true};
}
