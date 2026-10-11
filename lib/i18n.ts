import {sq,sqPatterns} from './i18n-sq';

// Albanian and English (C10). English text is the key; Albanian comes from lib/i18n-sq.ts and falls back to English
// when a line has no translation yet. The customer-facing site, emails and API messages are translated; the admin stays English.

export type Lang='sq'|'en';
export const LANGS:{code:Lang;label:string}[]=[{code:'sq',label:'Shqip'},{code:'en',label:'English'}];
export const LANG_COOKIE='studio_lang';
export const DEFAULT_LANG:Lang='sq';
export const isLang=(v:unknown):v is Lang=>v==='sq'||v==='en';
/** The language chosen with the switcher (a cookie), else Albanian. */
export const langFromCookie=(cookie:string|null|undefined):Lang=>{const v=cookie?.match(/(?:^|;\s*)studio_lang=(sq|en)\b/)?.[1];return isLang(v)?v:DEFAULT_LANG;};
type Vars=Record<string,string|number>;
const fill=(text:string,vars?:Vars)=>vars?text.replace(/\{(\w+)\}/g,(m,k)=>k in vars?String(vars[k]):m):text;
/** Translates a line of English UI text. `{name}` placeholders are filled from vars. */
export function translate(lang:Lang,text:string,vars?:Vars){
 if(lang==='en'||!text)return fill(text,vars);
 const exact=sq[text];if(exact!==undefined)return fill(exact,vars);
 for(const [re,to] of sqPatterns){const m=text.match(re);if(m)return fill(typeof to==='string'?to:to(m),vars);}
 return fill(text,vars);
}
const number=(lang:Lang,n:number)=>new Intl.NumberFormat(lang==='sq'?'sq-AL':'en-US').format(n);
/** "299 credits" / "299 kredite". */
export const creditsText=(lang:Lang,n:number)=>lang==='sq'?number(lang,n)+(n===1?' kredit':' kredite'):number(lang,n)+' credit'+(n===1?'':'s');
const statusEn:Record<string,string>={queued:'Queued',preparing:'Preparing',generating:'Generating',finalizing:'Finalizing',completed:'Completed',failed:'Failed',refused:'Refused',pending:'Pending',paid:'Paid',refunded:'Refunded',reversed:'Reversed',cancelled:'Cancelled',captured:'Spent',released:'Returned'};
export const statusText=(lang:Lang,s:string)=>statusEn[s]?translate(lang,statusEn[s]):s;
/** Dates in the studio's time zone, so the server and the browser print the same day. */
export const dateText=(lang:Lang,n:number)=>new Intl.DateTimeFormat(lang==='sq'?'sq-AL':'en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'Europe/Tirane'}).format(n);
