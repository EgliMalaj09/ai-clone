import {all,audit,must,now,one,parse,run,uid} from './data';
import {readUploadedFile} from './http';
import {rateLimit} from './security';
import {imageMime,storage} from './storage';
import type {StudioUser} from '../contracts';

// Studio-owned preview media. Customer photos live in user_uploads and never share these limits.
const MAX_FILE=30*1024*1024,MAX_TOTAL=5*1024*1024*1024,MAX_FILES=1000;
// Uploaded but never saved to a template: kept this long so an editor session is not cleaned up mid-edit.
const GRACE=24*3600000;
const PREFIX='/api/media/';
const url=(id:string)=>PREFIX+id;
/** True while any template shows the file, or a past creation still uses it as its poster. */
const inUse=(ref:string)=>`(EXISTS (SELECT 1 FROM templates t WHERE t.thumbnail='${PREFIX}'||${ref} OR t.preview_video='${PREFIX}'||${ref} OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(t.preview_images) THEN t.preview_images ELSE '[]' END) j WHERE j.value='${PREFIX}'||${ref})) OR EXISTS (SELECT 1 FROM generations g WHERE g.thumbnail='${PREFIX}'||${ref}))`;

export async function uploadTemplateMedia(req:Request,user:StudioUser){
 await rateLimit('template-media:'+user.id,100,3600000);
 const usage=await one('SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM template_media');
 const full='The studio media library is full. Delete unused files in Media library.';
 must(usage&&usage.count<MAX_FILES&&usage.bytes<MAX_TOTAL,full,413);
 const {file,bytes}=await readUploadedFile(req,MAX_FILE,'Preview media must be under 30 MB.');
 must(usage.bytes+file.size<=MAX_TOTAL,full,413);
 let mime=imageMime(bytes);if(new TextDecoder().decode(bytes.slice(4,8))==='ftyp'&&file.type==='video/mp4')mime='video/mp4';
 must(mime&&mime===file.type,'Upload a valid JPG, PNG, or WEBP image (or an MP4 preview).',415);
 const id=uid('med_'),key='previews/'+id;
 await storage.put(key,bytes,mime);
 try{await run('INSERT INTO template_media (id,storage_key,mime,size,name,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?)',id,key,mime,file.size,file.name.slice(0,120),user.id,now());}catch(e){await storage.delete(key);throw e}
 await audit(user.id,'media.upload',id);
 return {id,url:url(id),mime,name:file.name};
}

/** Delete matching files that nothing uses. The row is removed first, re-checked atomically, then its bytes. */
async function removeUnused(where:string,args:unknown[],limit=50){
 const rows=await all(`SELECT m.id FROM template_media m WHERE ${where} AND NOT ${inUse('m.id')} ORDER BY m.created_at LIMIT ?`,...args,limit);
 let removed=0;
 for(const r of rows){const gone=await one(`DELETE FROM template_media WHERE id=? AND NOT ${inUse('template_media.id')} RETURNING storage_key`,r.id);if(gone){await storage.delete(gone.storage_key);removed++;}}
 return removed;
}
export const templateMediaUrls=(t:{thumbnail:string;previewVideo:string;previewImages:string[]})=>[t.thumbnail,t.previewVideo,...t.previewImages];
/** After a template stops using files (replaced or deleted), remove the ones no other template or creation needs. */
export async function releaseTemplateMedia(urls:string[]){
 const ids=[...new Set(urls.filter(u=>u?.startsWith(PREFIX)).map(u=>u.slice(PREFIX.length)))];
 return ids.length?removeUnused(`m.id IN (${ids.map(()=>'?').join(',')})`,ids,ids.length):0;
}
/** Hourly maintenance: uploads that were never saved to a template. */
export const sweepTemplateMedia=()=>removeUnused('m.created_at<?',[now()-GRACE]);

export async function listTemplateMedia(){
 const [media,templates,posters,usage]=await Promise.all([
  all('SELECT m.id,m.mime,m.size,m.name,m.created_at,u.email AS uploaded_by FROM template_media m LEFT JOIN users u ON u.id=m.uploaded_by ORDER BY m.created_at DESC LIMIT 1000'),
  all('SELECT id,name,thumbnail,preview_video,preview_images FROM templates'),
  all("SELECT thumbnail,COUNT(*) AS count FROM generations WHERE thumbnail LIKE '/api/media/%' GROUP BY thumbnail"),
  one('SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM template_media'),
 ]);
 return {media:media.map(m=>{const path=url(m.id);const usedBy=templates.filter(t=>t.thumbnail===path||t.preview_video===path||parse<string[]>(t.preview_images,[]).includes(path)).map(t=>({id:t.id,name:t.name}));const creations=posters.find(p=>p.thumbnail===path)?.count||0;
  return {id:m.id,url:path,mime:m.mime,size:m.size,name:m.name,createdAt:m.created_at,uploadedBy:m.uploaded_by,usedBy,creations,removableAt:usedBy.length||creations?null:m.created_at+GRACE};}),
  usage:{bytes:usage?.bytes||0,count:usage?.count||0,maxBytes:MAX_TOTAL,maxFiles:MAX_FILES}};
}
export async function deleteTemplateMedia(id:string,user:StudioUser){
 must(await one('SELECT id FROM template_media WHERE id=?',id),'File not found.',404);
 must(await removeUnused('m.id=?',[id],1),'This file is used by a template or a past creation, so it cannot be deleted.',409);
 await audit(user.id,'media.delete',id);
}
