export type PublicTemplate = {
  id: string; name: string; slug: string; description: string; category: string;
  thumbnail: string; previewVideo: string; previewImages: string[];
  creditCost: number; requiredImageCount: number; aspectRatio: string;
  duration: number; resolution: string; featured: boolean; trending: boolean;
  isNew: boolean; popular: boolean; active: boolean; createdAt: number;
  /** Extra photo tips for this template only (C31.4), one per line. */
  photoTips: string;
  /** Manual catalog position (V13); lower comes first in Recommended. */
  sortOrder?: number;
  /** Choices the customer picks (V22/V23/V37); prompts and models stay private. */
  options?: PublicOptionGroup[];
  /** 'product' templates (V39) ask for a product photo instead of a face. */
  subject?: 'person'|'product';
  /** What the customer receives (V8): a video or a photo. */
  kind?: 'video'|'image';
};
/** Template options (V22 style, V23 format, V37 quality). The first choice of each group is the default. */
export type OptionChoice={id:string;label:string;labelSq?:string;credits?:number;aspectRatio?:string;prompt?:string;model?:string};
export type OptionGroup={id:string;kind:'style'|'format'|'quality';label:string;labelSq?:string;choices:OptionChoice[]};
export type PublicOptionGroup={id:string;kind:OptionGroup['kind'];label:string;labelSq?:string;choices:Omit<OptionChoice,'prompt'|'model'>[]};
export const publicOptions=(groups:OptionGroup[]):PublicOptionGroup[]=>groups.map(g=>({id:g.id,kind:g.kind,label:g.label,labelSq:g.labelSq,choices:g.choices.map(c=>({id:c.id,label:c.label,labelSq:c.labelSq,credits:c.credits||0,aspectRatio:c.aspectRatio}))}));
/** The picked choice of each group (the first one when nothing valid was picked). */
export const pickedChoices=<C extends {id:string}>(groups:{id:string;choices:C[]}[],picks:Record<string,string>={})=>groups.map(g=>g.choices.find(c=>c.id===picks[g.id])||g.choices[0]).filter(Boolean) as C[];
export const optionsCost=(base:number,groups:{id:string;choices:{id:string;credits?:number}[]}[],picks:Record<string,string>={})=>base+pickedChoices(groups,picks).reduce((n,c)=>n+(c.credits||0),0);
export type WorkflowStep = {
  id: string; type: 'image'|'transform'|'video'|'upscale'|'process'; provider: string;
  model: string; prompt: string; negativePrompt: string; inputs: Record<string,string>;
  output: string; settings: Record<string,unknown>; duration: number; resolution: string;
  aspectRatio: string; cost: number;
  /** Backup model (V35): used once, automatically, if this step fails on its main model. */
  fallback?: {provider:string;model:string}|null;
};
export type AdminTemplate = PublicTemplate & {
  estimatedCost: number; currency: string; provider: string; model: string; generationType: string;
  hiddenPrompt: string; negativePrompt: string; settings: Record<string,unknown>; workflow: WorkflowStep[];
  /** Scheduled publishing (V13): the template goes live at this time. */
  publishAt?: number|null;
  optionGroups?: OptionGroup[];
  archivedAt?: number|null;
};
export type StudioUser = {id:string;name:string;email:string;role:string;status:string;createdAt:number;avatar:string|null;emailVerified:boolean;contentStrikes:number;blocked:boolean;twoFactor?:boolean;locale?:'sq'|'en';pendingEmail?:string|null;marketingOptIn?:boolean};
// The published version of the Terms and Privacy Policy. Bump this whenever the legal pages change
// so new sign-ups record which version they accepted (C20.1). Keep it in sync with the legal pages (P3).
/** Roles (V10): customers ('user'), support staff with limited admin access, and administrators. */
export type Role='user'|'support'|'admin';
export const isStaff=(role?:string|null)=>role==='admin'||role==='support';
/** What the support role may do in the admin: help customers, never money, keys, settings or the catalog. */
export const SUPPORT_SECTIONS=['users','generations','reports','operations'];
export const TERMS_VERSION='2026-10-07';
// Minimum age customers confirm at sign-up (D13).
export const MINIMUM_AGE=13;
// Photo guidelines shown in the upload area (C31). Studio-wide default, editable by an admin.
// English only for now; Albanian follows with the site-wide translation (C10).
export type PhotoGuidelines={do:string[];dont:string[]};
/** Support contact and social accounts shown on the Contact page and in the footer (C26); edited in Admin → Settings. */
export type SupportInfo={email:string;phone:string;responseTime:string;instagram:string;tiktok:string;facebook:string;reviewUrl:string};
export const EMPTY_SUPPORT_INFO:SupportInfo={email:'',phone:'',responseTime:'',instagram:'',tiktok:'',facebook:'',reviewUrl:''};
/** The business behind the studio (D9). TODO(D9): add the NIPT and address once confirmed. */
export const BUSINESS={name:'VASIL XHAJA',country:'Albania'};
export const DEFAULT_PHOTO_GUIDELINES:PhotoGuidelines={
 do:[
  'Use a recent photo of yourself',
  'Face clearly visible and facing the camera',
  'Good, even lighting',
  'Sharp and in focus',
 ],
 dont:[
  'No sunglasses or anything covering the face',
  'No heavy filters',
  'No group photos',
  'Don’t stand too far from the camera',
 ],
};
/** The "how many photos" line, driven by the template's required photo count. */
/** Photo rules for product templates (V39): no face rules. */
export const PRODUCT_PHOTO_GUIDELINES:PhotoGuidelines={do:['The product fills most of the photo','Plain, uncluttered background','Bright, even light without strong shadows','Sharp, with logos and labels readable'],dont:['No other products in the photo','No hands or people covering it','No heavy filters or text added on top','Don’t crop off parts of the product']};
export const productCountLine=(count:number)=>count>1?`Upload ${count} product photos — one product in each`:'One product, clearly visible';
export const photoCountLine=(count:number)=>count>1?`Upload ${count} photos — one clear face in each`:'One person, with the face clearly visible';
/** Keeps only non-empty, trimmed, length-capped lines; used for admin-edited guidelines. */
export const cleanGuidelineList=(lines:string[],max=12)=>lines.map(l=>l.trim()).filter(Boolean).slice(0,max);
export const categories=['All templates','Cinematic','Transformation','Action','Fashion','Couples','Fantasy','Social','Business','Travel','Anime','Sports','Lifestyle','Funny','Products'];
/** How a template's output is described to the customer (C27): orientation and where it fits. */
export const formatLabel=(ratio:string)=>({'9:16':'Vertical 9:16 — Stories, Reels, TikTok','16:9':'Landscape 16:9 — YouTube, TV','1:1':'Square 1:1 — feed posts','4:5':'Portrait 4:5 — Instagram feed'} as Record<string,string>)[ratio]||ratio;
export const credits=(n:number)=>new Intl.NumberFormat('en-US').format(n)+' credit'+(n===1?'':'s');
/** Formats minor units exactly (C13): lek shows no decimals for whole amounts, but a fractional amount is never rounded away (299.50 stays 299.50). */
export const money=(amount:number,currency='USD')=>{const whole=Number.isInteger(amount/100);return new Intl.NumberFormat('en-US',{style:'currency',currency,...(whole?{}:{minimumFractionDigits:2,maximumFractionDigits:2})}).format(amount/100);};
// Lowest price of one credit per currency (minor units, fractional), from the active packs. Lets guests see roughly what credits cost.
export type CreditRef=Record<string,number>;
/** Approximate real-money price of a credit cost, e.g. "≈ ALL 140". Uses lek when available, else euro; '' when unknown. */
export const approxPrice=(creditCost:number,ref?:CreditRef)=>{
 if(!ref||creditCost<=0)return '';
 const currency=ref.ALL!==undefined?'ALL':ref.EUR!==undefined?'EUR':Object.keys(ref)[0];
 if(!currency||!(ref[currency]>0))return '';
 const raw=creditCost*ref[currency];// minor units
 const step=currency==='ALL'?1000:10;// round to a tidy value: 10 lek, or 10 cents
 return '≈ '+money(Math.max(step,Math.round(raw/step)*step),currency);
};
export const statusLabel=(s:string)=>({queued:'Queued',preparing:'Preparing',generating:'Generating',finalizing:'Finalizing',completed:'Completed',failed:'Failed',refused:'Refused',pending:'Pending',paid:'Paid',refunded:'Refunded',reversed:'Reversed',cancelled:'Cancelled',captured:'Spent',released:'Returned'}[s]??s);
