import {z} from 'zod';
import {all,audit,batch,getAdminTemplate,must,one,parse,run,templateStatements} from './data';
import {DEFAULT_PRICING,PRICING_RESOLUTIONS,lengthCredits,percentOff,type AdminTemplate,type Pricing,type StudioUser} from '../contracts';

// Pricing by length. The AI bills per second (video + reference clip), so a template priced by length costs
// (duration + clip seconds) × credits per second of its resolution, and its margin stays the same at any length.
// A single video (no pack) costs the dearest pack's credit price plus singleMarkup %. The pack offer takes a % off one pack.

const KEY='pricing';
export const pricingSchema=z.object({
 perSecond:z.object(Object.fromEntries(PRICING_RESOLUTIONS.map(r=>[r,z.number().min(0.1).max(1000)])) as Record<(typeof PRICING_RESOLUTIONS)[number],z.ZodNumber>),
 singleMarkup:z.number().int().min(0).max(300),
 offer:z.object({enabled:z.boolean(),packageId:z.string().max(100),percent:z.number().int().min(1).max(90)}),
});

export async function pricingSettings():Promise<Pricing>{
 const saved=parse<Partial<Pricing>>((await one("SELECT value FROM app_settings WHERE key=?",KEY))?.value as string,{});
 return {perSecond:{...DEFAULT_PRICING.perSecond,...(saved.perSecond||{})},singleMarkup:typeof saved.singleMarkup==='number'?saved.singleMarkup:DEFAULT_PRICING.singleMarkup,offer:{...DEFAULT_PRICING.offer,...(saved.offer||{})}};
}

/** The credit cost a template is sold at: worked out from its length when it is priced by length. */
export function templateCredits(t:Pick<AdminTemplate,'autoPrice'|'clipSeconds'|'duration'|'resolution'|'creditCost'>,p:Pricing){
 return t.autoPrice?lengthCredits(t.duration,t.clipSeconds||0,t.resolution,p.perSecond):t.creditCost;
}

/** Saves the pricing rules and re-prices every template that is priced by length. Returns how many changed. */
export async function savePricing(user:StudioUser,input:unknown){
 const b=pricingSchema.parse(input);
 if(b.offer.enabled)must(await one('SELECT id FROM credit_packages WHERE id=? AND active=1',b.offer.packageId),'Choose an active credit pack for the special offer.',400);
 await run("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",KEY,JSON.stringify(b));
 await audit(user.id,'settings.update','pricing');
 return {pricing:b,repriced:await repriceTemplates(b)};
}

async function repriceTemplates(p:Pricing){
 let changed=0;
 for(const r of await all('SELECT id FROM templates WHERE auto_price=1')){
  const t=await getAdminTemplate(r.id as string);if(!t)continue;
  const cost=templateCredits(t,p);
  if(cost!==t.creditCost){await batch(templateStatements({...t,creditCost:cost},true));changed++;}
 }
 return changed;
}

/** The pack offer customers see, or null when it is off or its pack is not on sale. */
export async function packOffer(){
 const {offer}=await pricingSettings();
 if(!offer.enabled||!offer.packageId)return null;
 const pack=await one('SELECT id FROM credit_packages WHERE id=? AND active=1',offer.packageId);
 return pack?{packageId:offer.packageId,percent:offer.percent}:null;
}
/** Price of a pack after the offer, when the offer is for this pack. */
export async function offerPrice(packageId:string,amount:number,currency:string){
 const o=await packOffer();
 return o&&o.packageId===packageId?{percent:o.percent,amount:percentOff(amount,o.percent,currency)}:null;
}
