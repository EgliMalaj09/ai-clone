export type PublicTemplate = {
  id: string; name: string; slug: string; description: string; category: string;
  thumbnail: string; previewVideo: string; previewImages: string[];
  creditCost: number; requiredImageCount: number; aspectRatio: string;
  duration: number; resolution: string; featured: boolean; trending: boolean;
  isNew: boolean; popular: boolean; active: boolean; createdAt: number;
};
export type WorkflowStep = {
  id: string; type: 'image'|'transform'|'video'|'upscale'|'process'; provider: string;
  model: string; prompt: string; negativePrompt: string; inputs: Record<string,string>;
  output: string; settings: Record<string,unknown>; duration: number; resolution: string;
  aspectRatio: string; cost: number;
};
export type AdminTemplate = PublicTemplate & {
  estimatedCost: number; currency: string; provider: string; model: string; generationType: string;
  hiddenPrompt: string; negativePrompt: string; settings: Record<string,unknown>; workflow: WorkflowStep[];
};
export type StudioUser = {id:string;name:string;email:string;role:string;status:string;createdAt:number;avatar:string|null;emailVerified:boolean;contentStrikes:number;blocked:boolean};
// The published version of the Terms and Privacy Policy. Bump this whenever the legal pages change
// so new sign-ups record which version they accepted (C20.1). Keep it in sync with the legal pages (P3).
export const TERMS_VERSION='2026-10-07';
// Minimum age customers confirm at sign-up (D13).
export const MINIMUM_AGE=13;
// Photo guidelines shown in the upload area (C31). Studio-wide default, editable by an admin.
// English only for now; Albanian follows with the site-wide translation (C10).
export type PhotoGuidelines={do:string[];dont:string[]};
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
export const photoCountLine=(count:number)=>count>1?`Upload ${count} photos — one clear face in each`:'One person, with the face clearly visible';
/** Keeps only non-empty, trimmed, length-capped lines; used for admin-edited guidelines. */
export const cleanGuidelineList=(lines:string[],max=12)=>lines.map(l=>l.trim()).filter(Boolean).slice(0,max);
export const categories=['All templates','Cinematic','Transformation','Action','Fashion','Couples','Fantasy','Social','Business','Travel','Anime','Sports','Lifestyle','Funny'];
export const credits=(n:number)=>new Intl.NumberFormat('en-US').format(n)+' credit'+(n===1?'':'s');
export const money=(amount:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount/100);
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
