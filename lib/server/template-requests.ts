import {z} from 'zod';
import {all,audit,batch,must,now,one,run,stmt,uid} from './data';
import {rateLimit} from './security';
import type {StudioUser} from '../contracts';

// Template ideas (V43): signed-in customers suggest a template or vote for one; the admin sets the status.
const publicIdea=(r:Record<string,unknown>,mine:Set<string>)=>({id:r.id as string,title:r.title as string,details:r.details as string,status:r.status as string,votes:Number(r.votes),voted:mine.has(r.id as string),templateSlug:(r.template_slug as string|null)??null,createdAt:r.created_at as number});

export async function listIdeas(user:StudioUser|null){
 const rows=await all("SELECT r.*,t.slug AS template_slug FROM template_requests r LEFT JOIN templates t ON t.id=r.template_id AND t.active=1 WHERE r.status IN ('open','planned','done') ORDER BY CASE r.status WHEN 'planned' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,r.votes DESC,r.created_at DESC LIMIT 60");
 const mine=new Set(user?(await all('SELECT request_id FROM template_request_votes WHERE user_id=?',user.id)).map(v=>v.request_id as string):[]);
 return {ideas:rows.map(r=>publicIdea(r,mine))};
}
export async function suggestIdea(user:StudioUser,input:unknown){
 await rateLimit('ideas:'+user.id,5,86400000);
 const b=z.object({title:z.string().trim().min(3,'Give your idea a short title.').max(80),details:z.string().trim().max(500).default('')}).parse(input);
 const id=uid('idea_');await batch([stmt('INSERT INTO template_requests (id,user_id,title,details,created_at) VALUES (?,?,?,?,?)',id,user.id,b.title,b.details,now()),stmt('INSERT INTO template_request_votes (request_id,user_id,created_at) VALUES (?,?,?)',id,user.id,now())]);
 return {id};
}
export async function toggleVote(user:StudioUser,id:string){
 await rateLimit('idea-votes:'+user.id,60,3600000);
 must(await one("SELECT id FROM template_requests WHERE id=? AND status IN ('open','planned')",id),'This idea is closed for votes.',404);
 const removed=await one('DELETE FROM template_request_votes WHERE request_id=? AND user_id=? RETURNING request_id',id,user.id);
 if(!removed)await run('INSERT OR IGNORE INTO template_request_votes (request_id,user_id,created_at) VALUES (?,?,?)',id,user.id,now());
 await run('UPDATE template_requests SET votes=(SELECT COUNT(*) FROM template_request_votes WHERE request_id=?) WHERE id=?',id,id);
 return {voted:!removed};
}
export async function adminIdeas(){
 const rows=await all('SELECT r.*,u.email,t.name AS template_name FROM template_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN templates t ON t.id=r.template_id ORDER BY CASE r.status WHEN \'open\' THEN 0 WHEN \'planned\' THEN 1 ELSE 2 END,r.votes DESC,r.created_at DESC LIMIT 200');
 return {ideas:rows.map(r=>({id:r.id as string,title:r.title as string,details:r.details as string,status:r.status as string,votes:Number(r.votes),email:(r.email as string|null)??null,templateId:(r.template_id as string|null)??null,templateName:(r.template_name as string|null)??null,createdAt:r.created_at as number}))};
}
export async function updateIdea(admin:StudioUser,id:string,input:unknown){
 const b=z.object({status:z.enum(['open','planned','done','declined']),templateId:z.string().max(150).nullable().optional()}).parse(input);
 if(b.templateId)must(await one('SELECT id FROM templates WHERE id=?',b.templateId),'Template not found.',404);
 const r=await one('UPDATE template_requests SET status=?,template_id=COALESCE(?,template_id) WHERE id=? RETURNING id',b.status,b.templateId??null,id);must(r,'Idea not found.',404);
 await audit(admin.id,'idea.'+b.status,id);return {ok:true};
}
