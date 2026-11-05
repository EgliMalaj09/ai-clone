// Pages people can find from Google (X1.7): landing pages for the main searches, and one page per template category.
// Text is English here and translated through the dictionary (lib/i18n-sq.ts); the web addresses are Albanian, matching
// what people search for in Albania. A landing page lists the templates in its categories, or every template when the
// studio has none in them yet (for example before the first birthday template is published).

export type LandingPage={slug:string;title:string;description:string;heading:string;intro:string;categories:string[]};

export const LANDING_PAGES:LandingPage[]=[
 {slug:'ai-video-nga-foto',title:'AI video from one photo',
  description:'Turn one photo into a short AI video of yourself: pick a template, upload your photo and share it on Instagram, TikTok or WhatsApp.',
  heading:'Turn one photo into an AI video',
  intro:'Pick a scene, upload one clear photo of yourself and get a short video where you are the main character. You pay with credits, and only for videos that are delivered.',
  categories:[]},
 {slug:'video-per-dasem',title:'AI wedding video from your photos',
  description:'Make a cinematic wedding-style AI video from a photo of the two of you, ready to share with family and friends.',
  heading:'A cinematic wedding video from your photos',
  intro:'Upload a photo of the two of you and get a short, cinematic wedding-style video — for the invitation, the big day or the anniversary.',
  categories:['Couples','Wedding','Weddings']},
 {slug:'video-per-ditelindje',title:'AI birthday video from a photo',
  description:'Make a fun AI birthday video from one photo of the birthday star, and send it on WhatsApp or post it on Instagram.',
  heading:'A birthday surprise made from one photo',
  intro:'Upload one photo of the birthday star and turn it into a short, fun video to send on WhatsApp or post on Instagram.',
  categories:['Birthday','Birthdays']},
];

export const landingPage=(slug:string|undefined)=>LANDING_PAGES.find(p=>p.slug===slug);
/** The web address part for a category: "Couples" → "couples", "Sci-Fi & Space" → "sci-fi-space". */
export const categorySlug=(category:string)=>category.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

/** What the storefront shows above the template grid on these pages. */
export type Landing={kind:'search'|'category';slug:string;category?:string;title:string;description:string;heading:string;intro:string;count:number};
