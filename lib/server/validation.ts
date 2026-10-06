import {z} from 'zod';
import {must,one} from './data';
import {seedTemplates} from '../catalog';
const media=z.string().max(1000).refine(v=>v===''||/^\/media\/[a-z0-9-]+\.(webp|png|jpg|jpeg|mp4|webm)$/.test(v)||/^\/api\/media\/[a-zA-Z0-9_]+$/.test(v),'Upload media or use a local studio media path.');
export const stepSchema=z.object({id:z.string().max(100),type:z.enum(['image','transform','video','upscale','process']),provider:z.enum(['mock','fal','replicate']),model:z.string().min(1).max(200),prompt:z.string().max(20000),negativePrompt:z.string().max(5000),inputs:z.record(z.string().max(2000)),output:z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),settings:z.record(z.unknown()),duration:z.number().int().min(1).max(120),resolution:z.string().max(30),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']),cost:z.number().int().min(0).max(1000000)});
export const templateSchema=z.object({id:z.string().optional(),name:z.string().trim().min(2).max(100),slug:z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(120),description:z.string().min(10).max(2000),category:z.string().min(2).max(50),thumbnail:media,previewVideo:media,previewImages:z.array(media).max(6),active:z.boolean(),featured:z.boolean(),trending:z.boolean(),isNew:z.boolean(),popular:z.boolean(),creditCost:z.number().int().min(0).max(1000000),estimatedCost:z.number().int().min(0).max(1000000),currency:z.enum(['USD','EUR','GBP','ALL']),requiredImageCount:z.number().int().min(1).max(4),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']),duration:z.number().int().min(1).max(120),resolution:z.string().max(30),generationType:z.enum(['video','image']),provider:z.enum(['mock','fal','replicate']),model:z.string().min(1).max(200),hiddenPrompt:z.string().max(20000),negativePrompt:z.string().max(5000),settings:z.record(z.unknown()),workflow:z.array(stepSchema).min(1).max(8),createdAt:z.number().optional()}).superRefine((t,c)=>{if(t.active&&!t.thumbnail)c.addIssue({code:'custom',message:'Add a thumbnail before publishing.',path:['thumbnail']});if(t.active&&t.creditCost<1)c.addIssue({code:'custom',message:'Set a credit cost before publishing.',path:['creditCost']});if(t.active&&t.generationType!=='video')c.addIssue({code:'custom',message:'The storefront currently publishes video templates only. Save image templates as drafts.',path:['generationType']});
 if(t.active&&(!t.workflow.some(s=>s.type==='video')||['image','transform'].includes(t.workflow.at(-1)?.type||'')))c.addIssue({code:'custom',message:'A published workflow must finish with video output.',path:['workflow']});
 const vars=new Set(['aspect_ratio','duration','template_name',...Array.from({length:t.requiredImageCount},(_,i)=>'user_image_'+(i+1))]);
 const ids=new Set<string>();const reserved=new Set(['__proto__','constructor','prototype','toString','valueOf','aspect_ratio','duration','template_name',...Array.from({length:4},(_,i)=>'user_image_'+(i+1))]);
 t.workflow.forEach((step,index)=>{
  const issue=(message:string)=>c.addIssue({code:'custom',message,path:['workflow',index]});
  if(ids.has(step.id))issue('Every workflow step needs a unique ID.');ids.add(step.id);
  if(reserved.has(step.output))issue('Choose a non-reserved output variable.');
  function inspect(value:unknown,depth=0){if(depth>20){issue('Settings are nested too deeply.');return;}
   if(typeof value==='string'){for(const match of value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))if(!vars.has(match[1]))issue('Unavailable variable: '+match[1]+'. Check photo count and step order.');}
   else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))issue('Reserved settings key: '+key);inspect(child,depth+1);}
  }
  inspect([step.prompt||t.hiddenPrompt,step.negativePrompt||t.negativePrompt,step.inputs,{...t.settings,...step.settings}]);
  vars.add(step.output);vars.add('previous_output');
 });});
export const authSchema=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(10,'Use at least 10 characters.').max(128),name:z.string().trim().min(2).max(80).optional()});
export const generationSchema=z.object({templateId:z.string().max(150),uploadIds:z.array(z.string().max(100)).min(1).max(4),idempotencyKey:z.string().uuid(),expectedCost:z.number().int(),consent:z.literal(true)});

/** Preview assets are deliberately public. Only studio media can be published; personal uploads are never reachable here. */
export async function validateTemplateMedia(t:{thumbnail:string;previewVideo:string;previewImages:string[]}){
 const bundled=new Set(seedTemplates().flatMap(x=>[x.thumbnail,x.previewVideo,...x.previewImages]));
 for(const [url,kind] of [[t.thumbnail,'image'],[t.previewVideo,'video'],...t.previewImages.map(u=>[u,'image'])]){
  if(!url)continue;
  if(url.startsWith('/media/')){
   must(bundled.has(url),'This bundled preview does not exist. Upload a preview file.');
   must(kind==='video'?url.endsWith('.mp4'):!url.endsWith('.mp4'),'Choose the correct preview media type.');
  }else{
   const asset=await one('SELECT mime FROM template_media WHERE id=?',url.split('/').at(-1));
   must(asset,'Only media uploaded for templates can be used. Upload a preview file.');
   must(asset.mime.startsWith(kind+'/'),'Choose the correct preview media type.');
  }
 }
}
