import {z} from 'zod';
import {all,audit,must,now,one,run,uid} from './data';
import {serviceConfig} from './connections';
import {announcementMailContent} from './email-templates';
import {sendMail,sign} from './security';
import {reportError} from './errors';
import type {StudioUser} from '../contracts';

// Announcements (V36) and new-template emails (V29): sent only to verified, active customers who opted in to news (C20.3),
// in each customer's language, with a one-click unsubscribe. The dispatcher sends them in batches every minute.

const BATCH=40;
const audience="marketing_opt_in=1 AND status='active' AND email_verified=1";
const schema=z.object({subjectSq:z.string().trim().min(3).max(150),bodySq:z.string().trim().min(10).max(5000),subjectEn:z.string().trim().min(3).max(150),bodyEn:z.string().trim().min(10).max(5000),
 link:z.union([z.literal(''),z.string().trim().regex(/^\/[\w\-/#?=&.%]*$/,'Use a link to a page of the studio, starting with /.')]).default(''),linkLabelSq:z.string().trim().max(60).default(''),linkLabelEn:z.string().trim().max(60).default(''),templateId:z.string().max(150).optional()});
type Input=z.infer<typeof schema>;

export const unsubscribeSignature=async(userId:string)=>(await sign('unsubscribe:'+userId)).slice(0,32);
async function unsubscribeUrl(userId:string){return `${(await serviceConfig()).origin}/unsubscribe?u=${encodeURIComponent(userId)}&s=${await unsubscribeSignature(userId)}`;}
/** One-click unsubscribe from the email link (and the List-Unsubscribe header): no sign-in needed, the link is signed. */
export async function unsubscribe(userId:string,signature:string){
 must(userId&&signature&&signature===await unsubscribeSignature(userId),'This unsubscribe link is not valid.',400);
 await run('UPDATE users SET marketing_opt_in=0 WHERE id=?',userId);return {ok:true};
}

function mailFor(a:{subjectSq:string;bodySq:string;subjectEn:string;bodyEn:string;link:string|null;linkLabelSq?:string|null;linkLabelEn?:string|null},lang:'sq'|'en',origin:string,brand:string,unsub:string){
 return announcementMailContent({lang,brand,subject:lang==='en'?a.subjectEn:a.subjectSq,body:lang==='en'?a.bodyEn:a.bodySq,link:a.link?origin+a.link:null,linkLabel:(lang==='en'?a.linkLabelEn:a.linkLabelSq)||null,unsubscribeUrl:unsub});
}
const stored=(b:Input)=>({...b,link:b.link||null,linkLabel:JSON.stringify({sq:b.linkLabelSq,en:b.linkLabelEn})});

export async function audienceSize(){return Number((await one(`SELECT COUNT(*) AS n FROM users WHERE ${audience}`))?.n||0);}
export async function listAnnouncements(){
 const rows=await all('SELECT a.*,u.email FROM announcements a LEFT JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC LIMIT 50');
 return {audience:await audienceSize(),announcements:rows.map(r=>({id:r.id as string,subject:r.subject_sq as string,subjectEn:r.subject_en as string,status:r.status as string,total:Number(r.total),sent:Number(r.sent),createdAt:r.created_at as number,finishedAt:r.finished_at??null,by:r.email??null}))};
}
/** Sends the message to the admin only, in both languages, so they can check it first. */
export async function sendTest(admin:StudioUser,input:unknown){
 const b=schema.parse(input);const c=await serviceConfig();must(c.mailKey&&c.mailFrom,'Email delivery is not configured. Add it in Connections first.',503);
 const unsub=await unsubscribeUrl(admin.id),a=stored(b);
 for(const lang of ['sq','en'] as const)await sendMail(admin.email,mailFor({...a,linkLabelSq:b.linkLabelSq,linkLabelEn:b.linkLabelEn},lang,c.origin,c.brandName,unsub),'announcement-test-'+uid());
 return {ok:true};
}
export async function createAnnouncement(admin:StudioUser,input:unknown){
 const b=schema.parse(input);const c=await serviceConfig();must(c.mailKey&&c.mailFrom,'Email delivery is not configured. Add it in Connections first.',503);
 const total=await audienceSize();must(total>0,'No customers have agreed to news yet.',409);
 const id=uid('ann_');const a=stored(b);
 await run('INSERT INTO announcements (id,subject_sq,body_sq,subject_en,body_en,link,link_label,template_id,total,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,a.subjectSq,a.bodySq,a.subjectEn,a.bodyEn,a.link,a.linkLabel,b.templateId||null,total,admin.id,now());
 await audit(admin.id,'announcement.send',id);
 return {id,total};
}
export async function cancelAnnouncement(admin:StudioUser,id:string){const r=await one("UPDATE announcements SET status='cancelled',finished_at=? WHERE id=? AND status='sending' RETURNING id",now(),id);must(r,'Only an announcement that is still sending can be stopped.',409);await audit(admin.id,'announcement.cancel',id);return {ok:true};}

/** Dispatcher step: the next batch of one announcement. Each customer gets it once (idempotency key per announcement and customer). */
export async function sendAnnouncementBatch(){
 const a=await one("SELECT * FROM announcements WHERE status='sending' ORDER BY created_at LIMIT 1");if(!a)return 0;
 const c=await serviceConfig();if(!c.mailKey||!c.mailFrom)return 0;
 const users=await all(`SELECT id,email,locale FROM users WHERE ${audience} AND id>? ORDER BY id LIMIT ${BATCH}`,a.cursor);
 const labels=JSON.parse((a.link_label as string)||'{}') as {sq?:string;en?:string};
 const content={subjectSq:a.subject_sq as string,bodySq:a.body_sq as string,subjectEn:a.subject_en as string,bodyEn:a.body_en as string,link:a.link as string|null,linkLabelSq:labels.sq,linkLabelEn:labels.en};
 let sent=0;
 for(const u of users){try{if(await sendMail(u.email as string,mailFor(content,u.locale==='en'?'en':'sq',c.origin,c.brandName,await unsubscribeUrl(u.id as string)),`announcement-${a.id}-${u.id}`))sent++;}catch(e){await reportError('email','Announcement email failed',{error:e,context:{announcementId:a.id as string,userId:u.id as string}});}}
 const last=users.at(-1)?.id as string|undefined;
 await run(`UPDATE announcements SET sent=sent+?,cursor=?,status=CASE WHEN ? THEN 'sent' ELSE status END,finished_at=CASE WHEN ? THEN ? ELSE finished_at END WHERE id=? AND status='sending'`,sent,last??a.cursor,users.length<BATCH?1:0,users.length<BATCH?1:0,now(),a.id);
 return users.length;
}
