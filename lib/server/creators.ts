import {z} from 'zod';
import {all,audit,config,must,now,one,run,uid} from './data';
import type {StudioUser} from '../contracts';

// Creator & campaign tracking links (V38): a named code gives a shareable /register?ref=CODE link. Anyone who signs up
// with it is tagged (users.signup_source) and the admin sees sign-ups, paying customers and purchases per link. Whether
// (and how much) creators are paid is an owner decision (D17); this only measures. It reuses the referral ?ref= param: a
// customer's own invite code wins, otherwise a matching active creator code tags the sign-up (see attachReferral).

const normalize=(code:string)=>code.trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');

const schema=z.object({code:z.string().trim().min(3).max(30).transform(normalize).refine(v=>v.length>=3,'Use letters and numbers for the code.'),name:z.string().trim().min(1).max(80),note:z.string().trim().max(200).default('')});
export async function createCreatorLink(admin:StudioUser,input:unknown){
 const b=schema.parse(input);
 must(!await one('SELECT id FROM creator_links WHERE code=?',b.code),'A link with this code already exists.',409);
 must(!await one('SELECT id FROM users WHERE referral_code=?',b.code),'A customer already uses this code for invites.',409);
 const id=uid('cl_');await run('INSERT INTO creator_links (id,code,name,note,created_by,created_at) VALUES (?,?,?,?,?,?)',id,b.code,b.name,b.note,admin.id,now());
 await audit(admin.id,'creator-link.create',id);return {id};
}
export async function setCreatorLinkActive(admin:StudioUser,id:string,active:boolean){const r=await one('UPDATE creator_links SET active=? WHERE id=? RETURNING id',active?1:0,id);must(r,'Link not found.',404);await audit(admin.id,active?'creator-link.enable':'creator-link.disable',id);return {ok:true};}

/** Per link: sign-ups, how many of them bought, total paid purchases and credits sold to them. */
export async function listCreatorLinks(){
 const rows=await all('SELECT * FROM creator_links ORDER BY created_at DESC LIMIT 200');
 const out=[];
 for(const r of rows){
  const s=await one("SELECT COUNT(*) AS signups,COALESCE(SUM(CASE WHEN p.n>0 THEN 1 ELSE 0 END),0) AS buyers,COALESCE(SUM(p.n),0) AS purchases,COALESCE(SUM(p.cr),0) AS credits FROM users u LEFT JOIN (SELECT user_id,COUNT(*) AS n,SUM(credits) AS cr FROM credit_purchases WHERE status='paid' GROUP BY user_id) p ON p.user_id=u.id WHERE u.signup_source=?",r.code);
  out.push({id:r.id as string,code:r.code as string,name:r.name as string,note:r.note as string,active:!!r.active,createdAt:r.created_at as number,url:`${config().origin}/register?ref=${r.code}`,signups:Number(s?.signups||0),buyers:Number(s?.buyers||0),purchases:Number(s?.purchases||0),credits:Number(s?.credits||0)});
 }
 return {links:out};
}
