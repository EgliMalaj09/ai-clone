import {all,audit,event,must,now,one,run} from './data';
import {mediaUrl} from './storage';
import {pageQuery} from './http';
import {shareGeneration} from './share';
import {rateLimit} from './security';
import type {StudioUser} from '../contracts';

// Ratings (V6), the opt-in public gallery on template pages (V6) and the public feed with likes (V40).
// A video is public only after its owner chooses it; it also needs an active share link, so stopping sharing,
// deleting the video or a removal request takes it out of the gallery and the feed.

export async function rateCreation(user:StudioUser,id:string,stars:number){
 must(Number.isInteger(stars)&&stars>=1&&stars<=5,'Choose 1 to 5 stars.');
 const r=await one("UPDATE generations SET rating=?,rated_at=? WHERE id=? AND user_id=? AND status='completed' AND deleted_at IS NULL RETURNING id",stars,now(),id,user.id);must(r,'Completed creation not found.',404);
 await event('creation_rated',user.id,{generationId:id,stars});return {rating:stars};
}
export async function setPublic(user:StudioUser,id:string,show:boolean){
 if(show){await shareGeneration(user.id,id);const r=await one("UPDATE generations SET public_at=COALESCE(public_at,?) WHERE id=? AND user_id=? AND status='completed' AND deleted_at IS NULL RETURNING id",now(),id,user.id);must(r,'Completed creation not found.',404);}
 else await run('UPDATE generations SET public_at=NULL WHERE id=? AND user_id=?',id,user.id);
 return {public:show};
}
const visible="g.public_at IS NOT NULL AND g.deleted_at IS NULL AND g.status='completed' AND EXISTS (SELECT 1 FROM share_links s WHERE s.generation_id=g.id AND s.revoked_at IS NULL)";
async function items(rows:Record<string,unknown>[],viewer:StudioUser|null){
 const liked=new Set(viewer&&rows.length?(await all(`SELECT generation_id FROM feed_likes WHERE user_id=? AND generation_id IN (${rows.map(()=>'?').join(',')})`,viewer.id,...rows.map(r=>r.id))).map(r=>r.generation_id as string):[]);
 return Promise.all(rows.map(async r=>({id:r.id as string,templateName:r.template_name as string,templateSlug:r.template_slug as string,thumbnail:r.thumbnail as string,video:await mediaUrl(r.asset_id as string,now()+2*3600000),mime:r.mime as string,shareUrl:'/v/'+r.share_id,likes:Number(r.likes||0),liked:liked.has(r.id as string),publicAt:r.public_at as number})));
}
const select=`SELECT g.id,g.template_name,g.template_slug,g.thumbnail,g.likes,g.public_at,a.id AS asset_id,a.mime,(SELECT s.id FROM share_links s WHERE s.generation_id=g.id AND s.revoked_at IS NULL LIMIT 1) AS share_id FROM generations g JOIN generated_assets a ON a.generation_id=g.id AND a.kind='output' WHERE ${visible}`;
export async function feed(url:URL,viewer:StudioUser|null){
 const {page,limit,offset}=pageQuery(url,24);const sort=url.searchParams.get('sort')==='popular'?'g.likes DESC,g.public_at DESC':'g.public_at DESC';
 const [count,rows]=await Promise.all([one(`SELECT COUNT(*) AS total FROM generations g WHERE ${visible}`),all(`${select} ORDER BY ${sort},g.id LIMIT ? OFFSET ?`,limit,offset)]);
 const total=Number(count?.total||0);return {items:await items(rows,viewer),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}};
}
export async function templateGallery(templateId:string){return items(await all(`${select} AND g.template_id=? ORDER BY g.likes DESC,g.public_at DESC LIMIT 8`,templateId),null);}
export async function toggleLike(user:StudioUser,id:string){
 await rateLimit('likes:'+user.id,120,3600000);
 must(await one(`SELECT g.id FROM generations g WHERE g.id=? AND ${visible}`,id),'This video is not public.',404);
 const removed=await one('DELETE FROM feed_likes WHERE generation_id=? AND user_id=? RETURNING generation_id',id,user.id);
 if(!removed)await run('INSERT OR IGNORE INTO feed_likes (generation_id,user_id,created_at) VALUES (?,?,?)',id,user.id,now());
 const r=await one('UPDATE generations SET likes=(SELECT COUNT(*) FROM feed_likes WHERE generation_id=?) WHERE id=? RETURNING likes',id,id);
 return {liked:!removed,likes:Number(r?.likes||0)};
}
/** Staff take a video out of the gallery and feed (it stays in the owner's account). */
export async function hideFromFeed(staff:StudioUser,id:string){await run('UPDATE generations SET public_at=NULL WHERE id=?',id);await audit(staff.id,'feed.hide',id);return {ok:true};}
