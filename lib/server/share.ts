import {all,config,event,must,now,one,run} from './data';
import {mediaUrl} from './storage';

// Share pages (V3): /v/<id> shows one finished video with a preview card for WhatsApp, Instagram and Facebook.
// The link lives until the owner stops sharing or deletes the video; the file itself is served through short signed links.

const newId=()=>{const a='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(12));return Array.from(b,x=>a[x%a.length]).join('');};
const shareUrl=(id:string)=>`${config().origin}/v/${id}`;

/** Returns the active share link of the owner's finished video, creating one if needed. */
export async function shareGeneration(userId:string,generationId:string){
 const g=await one("SELECT g.id FROM generations g JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output' WHERE g.id=? AND g.user_id=? AND g.deleted_at IS NULL AND g.status='completed'",generationId,userId);must(g,'Completed creation not found.',404);
 const existing=await one('SELECT id FROM share_links WHERE generation_id=? AND revoked_at IS NULL',generationId);
 if(existing)return {url:shareUrl(existing.id as string),id:existing.id as string};
 const id=newId();await run('INSERT INTO share_links (id,generation_id,user_id,created_at) VALUES (?,?,?,?)',id,generationId,userId,now());
 await event('video_shared',userId,{generationId});
 return {url:shareUrl(id),id};
}
export async function stopSharing(userId:string,generationId:string){await run('UPDATE share_links SET revoked_at=? WHERE generation_id=? AND user_id=? AND revoked_at IS NULL',now(),generationId,userId);}
/** Which of these creations currently have a share link (for My creations). */
export async function sharedMap(ids:string[]){if(!ids.length)return new Map<string,string>();const rows=await all(`SELECT generation_id,id FROM share_links WHERE revoked_at IS NULL AND generation_id IN (${ids.map(()=>'?').join(',')})`,...ids);return new Map(rows.map(r=>[r.generation_id as string,shareUrl(r.id as string)]));}

/** Public data for a share page, or null when the link was revoked or the video is gone. */
export async function sharedVideo(id:string,countView=false){
 if(!/^[A-Za-z0-9]{12}$/.test(id))return null;
 const s=await one("SELECT s.id,g.id AS generation_id,g.template_name,g.template_slug,g.thumbnail,g.completed_at,a.id AS asset_id,a.mime FROM share_links s JOIN generations g ON g.id=s.generation_id AND g.deleted_at IS NULL AND g.status='completed' JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output' WHERE s.id=? AND s.revoked_at IS NULL",id);
 if(!s)return null;
 if(countView)await run('UPDATE share_links SET views=views+1 WHERE id=?',id);
 return {id:s.id as string,templateName:s.template_name as string,templateSlug:s.template_slug as string,thumbnail:s.thumbnail as string,completedAt:s.completed_at as number,video:`/api/share/${s.id}/video`,mime:s.mime as string,assetId:s.asset_id as string};
}
/** The video behind a share link: a short signed link to the private file. */
export async function sharedVideoRedirect(id:string){const s=await sharedVideo(id);must(s,'This video is no longer shared.',404);return Response.redirect(await mediaUrl(s.assetId,now()+3600000),302);}
