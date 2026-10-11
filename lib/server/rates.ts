// Exchange rates for margin math (C19). AI costs are entered in USD but packs sell in ALL/EUR,
// so costs are converted into the selling currency to show a real margin. Rates are USD -> currency,
// editable by an admin. Amounts are minor units (major x100) for every currency, so the x100 scale
// cancels in conversion and no per-currency scaling is needed.
import {all} from './data';

export const RATE_DEFAULTS={EUR:0.92,ALL:85};// 1 USD ~= 0.92 EUR, 85 ALL (approx; consistent with 1 EUR = 92 ALL)

export type Rates={USD:1;EUR:number;ALL:number};

export async function exchangeRates():Promise<Rates>{
 const rows=await all("SELECT key,value FROM app_settings WHERE key IN ('rate_usd_eur','rate_usd_all')");
 const get=(k:string,d:number)=>{const v=Number(rows.find(r=>r.key===k)?.value);return Number.isFinite(v)&&v>0?v:d;};
 return {USD:1,EUR:get('rate_usd_eur',RATE_DEFAULTS.EUR),ALL:get('rate_usd_all',RATE_DEFAULTS.ALL)};
}

/** Convert a minor-unit amount from one currency to another, using USD as the pivot. */
export function convertMinor(amount:number,from:string,to:string,rates:Rates){
 const rf=(rates as Record<string,number>)[from],rt=(rates as Record<string,number>)[to];
 if(!rf||!rt)return amount;// unknown currency: leave as-is rather than zero it out
 return Math.round(amount/rf*rt);
}
