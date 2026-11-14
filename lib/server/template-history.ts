import {all,audit,batch,getAdminTemplate,must,now,one,parse,run,templateStatements,uid,type Row} from './data';
import {templateSchema} from './validation';
import type {AdminTemplate} from '../contracts';

// Template history (V33): each save keeps a version of what customers get (prompt, workflow, settings, price, format),
// so an admin can compare versions and roll back. The newest 50 versions per template are kept.

const KEEP=50;
const CONTENT=['name','description','category','hiddenPrompt','negativePrompt','workflow','settings','creditCost','estimatedCost','currency','requiredImageCount','aspectRatio','duration','resolution','generationType','photoTips','thumbnail','previewVideo','previewImages'] as const;
type Content=Pick<AdminTemplate,typeof CONTENT[number]>;
const contentOf=(t:AdminTemplate):Content=>Object.fromEntries(CONTENT.map(k=>[k,t[k]])) as Content;
const labels:Record<string,string>={hiddenPrompt:'hidden prompt',negativePrompt:'negative prompt',workflow:'workflow',settings:'settings',creditCost:'credit cost',estimatedCost:'AI cost',requiredImageCount:'photo count',aspectRatio:'format',photoTips:'photo tips',previewImages:'example images',previewVideo:'preview video',generationType:'type'};
const changed=(a:Content|null,b:Content)=>a?CONTENT.filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>labels[k]||k):['first version'];

export async function recordVersion(t:AdminTemplate,userId:string|null){
 const last=await one('SELECT snapshot FROM template_versions WHERE template_id=? ORDER BY created_at DESC,id DESC LIMIT 1',t.id);
 const snap=contentOf(t);if(last&&last.snapshot===JSON.stringify(snap))return;
 await run('INSERT INTO template_versions (id,template_id,snapshot,created_at,created_by) VALUES (?,?,?,?,?)',uid('tv_'),t.id,JSON.stringify(snap),now(),userId);
 await run(`DELETE FROM template_versions WHERE template_id=? AND id NOT IN (SELECT id FROM template_versions WHERE template_id=? ORDER BY created_at DESC,id DESC LIMIT ${KEEP})`,t.id,t.id);
}
export async function listVersions(templateId:string){
 const rows=await all('SELECT v.id,v.snapshot,v.created_at,u.email FROM template_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.template_id=? ORDER BY v.created_at DESC,v.id DESC',templateId);
 return {versions:rows.map((r,i)=>{const snap=parse<Content>(r.snapshot as string,{} as Content),older=rows[i+1]?parse<Content>(rows[i+1].snapshot as string,{} as Content):null;return {id:r.id as string,createdAt:r.created_at as number,by:(r.email as string|null)??null,changes:changed(older,snap),snapshot:snap};})};
}
/** Restores a version's content; the slug, publish state and schedule stay as they are now. */
export async function restoreVersion(templateId:string,versionId:string,userId:string){
 const current=await getAdminTemplate(templateId);must(current&&current.id===templateId,'Template not found.',404);must(!current.archivedAt,'Restore this template from the archive first.',409);
 const v:Row|null=await one('SELECT snapshot FROM template_versions WHERE id=? AND template_id=?',versionId,templateId);must(v,'Version not found.',404);
 const next={...current,...parse<Content>(v.snapshot as string,{} as Content)} as AdminTemplate;
 const check=templateSchema.safeParse(next);must(check.success,'This version can no longer be used: '+(check.success?'':check.error.errors[0]?.message||'invalid'));
 await batch(templateStatements(next,true));await recordVersion(next,userId);await audit(userId,'template.restore-version',templateId);
 return {template:next};
}
