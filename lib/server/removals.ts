import {z} from 'zod';
import {all,audit,event,must,now,one,run,uid} from './data';
import {serviceConfig} from './connections';
import {noticeMailContent} from './email-templates';
import {sendMail} from './security';
import {removeGeneration} from './queue';
import {pageQuery} from './http';
import {reportError} from './errors';
import type {Lang} from '../i18n';
import type {StudioUser} from '../contracts';

// Removal requests (V30): anyone can ask for a video they appear in to be taken down. A request that names a share link
// takes that video offline at once (fast takedown); an administrator or support then removes the video or keeps it.

const requestSchema=z.object({
 video:z.string().trim().min(3,'Paste the link to the video, or describe where you saw it.').max(500),
 name:z.string().trim().min(2,'Enter your name.').max(80),
 email:z.string().trim().email('Enter a valid email address.').max(254).transform(s=>s.toLowerCase()),
 relation:z.enum(['self','representative','other']),
 details:z.string().trim().min(10,'Tell us briefly why the video should be removed.').max(2000),
 confirm:z.literal(true,{errorMap:()=>({message:'Confirm that the information is true.'})}),
});

export async function createRemovalRequest(input:unknown,lang:Lang){
 const b=requestSchema.parse(input);
 const shareId=b.video.match(/\/v\/([A-Za-z0-9]{12})\b/)?.[1]||(/^[A-Za-z0-9]{12}$/.test(b.video)?b.video:null);
 const share=shareId?await one('SELECT generation_id FROM share_links WHERE id=?',shareId):null;
 const generationId=(share?.generation_id as string|undefined)??null;
 const id=uid('rr_');
 await run('INSERT INTO removal_requests (id,generation_id,share_id,video_reference,name,email,relation,details,locale,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',id,generationId,shareId,b.video,b.name,b.email,b.relation,b.details,lang,now());
 // Fast takedown: the public share page goes offline until the request is reviewed.
 if(generationId){await run('UPDATE share_links SET revoked_at=? WHERE generation_id=? AND revoked_at IS NULL',now(),generationId);await run('UPDATE generations SET public_at=NULL WHERE id=?',generationId);}
 await event('removal_requested',null,{requestId:id,hidden:!!generationId});
 await reportError('queue','New removal request needs review',{level:'warning',context:{requestId:id,generationId}});
 return {ok:true,hidden:!!generationId};
}

export async function listRemovals(url:URL){
 const {page,limit,offset}=pageQuery(url,25);const status=url.searchParams.get('status')||'open';
 must(['open','removed','kept','all'].includes(status),'Unknown request status.');
 const where=status==='all'?'':' WHERE r.status=?',args=status==='all'?[]:[status];
 const [count,rows]=await Promise.all([one('SELECT COUNT(*) AS total FROM removal_requests r'+where,...args),all(`SELECT r.*,g.template_name,g.thumbnail,g.deleted_at,u.email AS owner_email,a.id AS asset_id FROM removal_requests r LEFT JOIN generations g ON g.id=r.generation_id LEFT JOIN users u ON u.id=g.user_id LEFT JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output'${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,...args,limit,offset)]);
 const total=Number(count?.total||0);
 return {requests:rows.map(r=>({id:r.id as string,videoReference:r.video_reference as string,name:r.name as string,email:r.email as string,relation:r.relation as string,details:r.details as string,status:r.status as string,adminNote:r.admin_note??null,createdAt:r.created_at as number,resolvedAt:r.resolved_at??null,
  video:r.generation_id&&!r.deleted_at?{generationId:r.generation_id as string,templateName:r.template_name as string,thumbnail:r.thumbnail as string,ownerEmail:r.owner_email??null,url:r.asset_id?'/api/media/'+r.asset_id:null}:null})),
  pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}};
}

export async function resolveRemoval(staff:StudioUser,id:string,input:unknown){
 const b=z.object({decision:z.enum(['remove','keep']),note:z.string().trim().max(1000).default(''),generationId:z.string().max(150).optional()}).parse(input);
 const r=await one('SELECT * FROM removal_requests WHERE id=?',id);must(r,'Request not found.',404);must(r.status==='open','This request is already closed.',409);
 // The reviewer may attach the video when the request only described it.
 const generationId=(r.generation_id as string|null)||b.generationId||null;
 const c=await serviceConfig();
 if(b.decision==='remove'){
  must(generationId,'Choose the video to remove: paste its creation ID.');
  const g=await one('SELECT id,user_id,template_name FROM generations WHERE id=? AND deleted_at IS NULL',generationId);must(g,'Creation not found.',404);
  await removeGeneration(g.id as string,g.user_id as string);
  const owner=await one('SELECT email,locale FROM users WHERE id=?',g.user_id);
  if(owner)await sendMail(owner.email as string,noticeMailContent({lang:owner.locale==='en'?'en':'sq',brand:c.brandName,subject:'Your “{name}” video was removed',heading:'A video was removed',lead:'Your “{name}” video was removed because someone shown in it asked us to take it down. Only use photos of people who agreed to it.',vars:{name:g.template_name as string},supportEmail:c.mailFrom}),'removal-owner-'+id);
 }
 await run('UPDATE removal_requests SET status=?,generation_id=?,admin_note=?,resolved_at=?,resolved_by=? WHERE id=?',b.decision==='remove'?'removed':'kept',generationId,b.note||null,now(),staff.id,id);
 await audit(staff.id,'removal.'+(b.decision==='remove'?'removed':'kept'),id);
 const lang=r.locale==='en'?'en':'sq';
 await sendMail(r.email as string,b.decision==='remove'
  ?noticeMailContent({lang,brand:c.brandName,subject:'We removed the video you reported',heading:'The video was removed',lead:'Thank you for telling us. We reviewed your request and removed the video. It is no longer available on {brand}.',supportEmail:c.mailFrom})
  :noticeMailContent({lang,brand:c.brandName,subject:'About your removal request',heading:'We reviewed your request',lead:'We reviewed your request and did not remove the video.'+(b.note?' {note}':'')+' If you have more information, reply to this email.',vars:{note:b.note},supportEmail:c.mailFrom}),'removal-'+id);
 return {ok:true};
}
