export type PublicTemplate = {
  id: string; name: string; slug: string; description: string; category: string;
  thumbnail: string; previewVideo: string; previewImages: string[];
  price: number; currency: string; requiredImageCount: number; aspectRatio: string;
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
  estimatedCost: number; provider: string; model: string; generationType: string;
  hiddenPrompt: string; negativePrompt: string; settings: Record<string,unknown>; workflow: WorkflowStep[];
};
export type StudioUser = {id:string;name:string;email:string;role:string;status:string;createdAt:number;avatar:string|null;emailVerified:boolean};
export const categories=['All templates','Cinematic','Transformation','Action','Fashion','Couples','Fantasy','Social','Business','Travel','Anime','Sports','Lifestyle','Funny'];
export const money=(amount:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount/100);
export const statusLabel=(s:string)=>({awaiting_payment:'Waiting for Payment',queued:'Queued',preparing:'Preparing',generating:'Generating',finalizing:'Finalizing',completed:'Completed',failed:'Failed',pending:'Pending',paid:'Paid',refunded:'Refunded',cancelled:'Cancelled'}[s]??s);
