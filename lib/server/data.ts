import {liveWorkflow} from './workflow-presets';
import {env} from 'cloudflare:workers';
import {seedTemplates} from '../catalog';
import type {AdminTemplate,PublicTemplate,WorkflowStep} from '../contracts';
// D1 rows are dynamically shaped; each query's columns are read by name at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row=Record<string,any>;
export const now=()=>Date.now();
export const uid=(prefix='')=>prefix+crypto.randomUUID().replace(/-/g,'');
// Text variables and secrets. Bindings such as DB and BUCKET are only checked for presence through this view.
export const runtime=()=>env as unknown as Record<string,string|undefined>;
export function config(){const e=runtime();const demo=e.DEMO_MODE==='true';return {demo,origin:e.APP_ORIGIN||'http://terminal.local:4173',secret:e.APP_SECRET||'',pokKeyId:e.POK_KEY_ID||'',pokKeySecret:e.POK_KEY_SECRET||'',pokMerchantId:e.POK_MERCHANT_ID||'',pokEnvironment:e.POK_ENVIRONMENT||'',falKey:e.FAL_KEY||'',higgsfieldKey:e.HIGGSFIELD_API_KEY||'',higgsfieldSecret:e.HIGGSFIELD_API_SECRET||'',replicateKey:e.REPLICATE_API_TOKEN||'',mailKey:e.RESEND_API_KEY||'',mailFrom:e.MAIL_FROM||'',cronSecret:e.QUEUE_SECRET||''};}
export function db():D1Database{if(!env.DB)throw new Error('Database unavailable');return env.DB;}
export const stmt=(sql:string,...args:unknown[])=>db().prepare(sql).bind(...args);
export const one=async(sql:string,...args:unknown[]):Promise<Row|null>=>stmt(sql,...args).first<Row>();
export const all=async(sql:string,...args:unknown[]):Promise<Row[]>=>((await stmt(sql,...args).all<Row>()).results);
export const run=(sql:string,...args:unknown[])=>stmt(sql,...args).run();
export const batch=(s:D1PreparedStatement[])=>db().batch(s);
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export function must(condition:unknown,message:string,status=400):asserts condition{if(!condition)throw new HttpError(status,message);}
export const parse=<T=unknown>(v:string|undefined|null,fallback:T):T=>{try{return JSON.parse(v||'') as T}catch{return fallback}};
export async function audit(userId:string,action:string,targetId:string){await run('INSERT INTO audit_logs (id,user_id,action,target_id,created_at) VALUES (?,?,?,?,?)',uid(),userId,action,targetId,now());}
export async function event(name:string,userId:string|null,metadata:Row={}){await run('INSERT INTO analytics_events (id,user_id,name,metadata,created_at) VALUES (?,?,?,?,?)',uid(),userId,name,JSON.stringify(metadata),now());}
export function publicTemplate(t:Row):PublicTemplate{return {id:t.id,slug:t.slug,name:t.name,description:t.description,category:t.category,thumbnail:t.thumbnail,previewVideo:t.preview_video,previewImages:parse(t.preview_images,[]),creditCost:t.credit_cost,requiredImageCount:t.required_image_count,aspectRatio:t.aspect_ratio,duration:t.duration,resolution:t.resolution,featured:!!t.featured,trending:!!t.trending,isNew:!!t.is_new,popular:!!t.popular,active:!!t.active,createdAt:t.created_at};}
export async function getPublicTemplate(slug:string){const t=await one('SELECT * FROM templates WHERE slug=? AND active=1',slug);return t?publicTemplate(t):null;}
export async function getAdminTemplate(id:string):Promise<AdminTemplate|null>{const t=await one('SELECT * FROM templates WHERE id=? OR slug=?',id,id);if(!t)return null;const w=await all('SELECT s.definition FROM template_workflow_steps s JOIN template_workflows w ON w.id=s.workflow_id WHERE w.template_id=? ORDER BY s.step_order',t.id);return {...publicTemplate(t),estimatedCost:t.estimated_cost,currency:t.currency,provider:t.provider,model:t.model,generationType:t.generation_type,hiddenPrompt:t.hidden_prompt,negativePrompt:t.negative_prompt,settings:parse(t.settings,{}),workflow:w.map(s=>parse<WorkflowStep>(s.definition,{} as WorkflowStep))};}
export function templateStatements(t:AdminTemplate,existing=false){const a=[t.slug,t.name,t.description,t.category,t.thumbnail,t.previewVideo,JSON.stringify(t.previewImages),Number(t.active),Number(t.featured),Number(t.trending),Number(t.isNew),Number(t.popular),t.estimatedCost,t.currency,t.requiredImageCount,t.aspectRatio,t.duration,t.resolution,t.generationType,t.provider,t.model,t.hiddenPrompt,t.negativePrompt,JSON.stringify(t.settings),t.creditCost,now()];
 const cols='slug,name,description,category,thumbnail,preview_video,preview_images,active,featured,trending,is_new,popular,estimated_cost,currency,required_image_count,aspect_ratio,duration,resolution,generation_type,provider,model,hidden_prompt,negative_prompt,settings,credit_cost,updated_at';
 const q=existing?stmt(`UPDATE templates SET ${cols.split(',').map(c=>c+'=?').join(',')} WHERE id=?`,...a,t.id):stmt(`INSERT OR IGNORE INTO templates (${cols},id,created_at) VALUES (${Array(a.length+2).fill('?').join(',')})`,...a,t.id,t.createdAt||now());
 const workflowId='wf_'+t.id;
 return [q,stmt('INSERT INTO template_workflows (id,template_id,version) VALUES (?,?,1) ON CONFLICT(template_id) DO UPDATE SET version=version+1',workflowId,t.id),stmt('DELETE FROM template_workflow_steps WHERE workflow_id=?',workflowId),...t.workflow.map((s,i)=>stmt('INSERT INTO template_workflow_steps (id,workflow_id,step_order,definition) VALUES (?,?,?,?)',workflowId+'_'+i,workflowId,i,JSON.stringify(s)))];}
let seeded=false;
export async function ensureSeed(){if(seeded)return;const marker=await one("SELECT value FROM app_settings WHERE key='seed_v1'");if(!marker){
 // Seed DML only. Schema is exclusively owned by checked-in Drizzle migrations.
 const data=seedTemplates();for(const t of data)if(!await one('SELECT id FROM templates WHERE id=?',t.id))await batch(templateStatements(t));
 await batch([stmt("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('seed_v1','true')"),stmt("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('auto_refund','true')"),...['mock','higgsfield','fal','replicate'].map(id=>stmt('INSERT OR IGNORE INTO provider_configurations (id,name,enabled,settings,updated_at) VALUES (?,?,?,?,?)',id,id==='mock'?'Development simulator':id==='higgsfield'?'Higgsfield':id==='fal'?'fal.ai':'Replicate',id==='mock'?1:0,'{}',now()))]);
 }
 if(!config().demo&&!await one("SELECT value FROM app_settings WHERE key='live_workflows_v1'")){
  // Upgrade only untouched starter workflows. Preserve custom templates, prices and edited prompts.
  for(const original of seedTemplates()){
   const current=await getAdminTemplate(original.id);
   if(current&&current.workflow.length===1&&current.workflow[0].model==='studio-demo'&&current.workflow[0].prompt===original.workflow[0].prompt&&current.hiddenPrompt===original.hiddenPrompt&&[5,10].includes(current.duration))await batch(templateStatements({...current,...liveWorkflow(current)},true));
  }
  await run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('live_workflows_v1','true')");
 }
 const e=runtime();if(e.ADMIN_EMAIL&&e.ADMIN_PASSWORD_HASH){const existing=await one('SELECT id FROM users WHERE email=?',e.ADMIN_EMAIL.toLowerCase());if(!existing)await run('INSERT OR IGNORE INTO users (id,email,name,password_hash,role,status,email_verified,created_at) VALUES (?,?,?,?,?,?,?,?)',uid('usr_'),e.ADMIN_EMAIL.toLowerCase(),'Studio Admin',e.ADMIN_PASSWORD_HASH,'admin','active',1,now());}
 seeded=true;
}
export async function loadPage(path:string[],h:Headers){try{await ensureSeed();const {getUser}=await import('./security');const user=await getUser(h);const templates=(await all('SELECT * FROM templates WHERE active=1 ORDER BY featured DESC,created_at DESC LIMIT 500')).map(publicTemplate);const selected=path[0]==='template'?await getPublicTemplate(path[1]):null;const {publicAvailability}=await import('./connections');const availability=await publicAvailability(selected?await getAdminTemplate(selected.id):null).catch(()=>({registrationAvailable:false,purchasingAvailable:false,generationAvailable:false}));const {balanceOf}=await import('./credits');const credits=user?await balanceOf(user.id):null;return {...availability,templates,selectedTemplate:selected,user,credits,demo:config().demo,favoriteIds:user?(await all('SELECT template_id FROM favorites WHERE user_id=?',user.id)).map(f=>f.template_id as string):[]};}catch(e){console.error('Page unavailable',e instanceof Error?e.message:'unknown');return {registrationAvailable:false,purchasingAvailable:false,generationAvailable:false,templates:[],selectedTemplate:null,user:null,credits:null,demo:config().demo,favoriteIds:[],error:'The studio is temporarily unavailable. Please refresh in a moment.'};}}
