'use client';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
import {creditsText,dateText,DEFAULT_LANG,LANG_COOKIE,LANGS,statusText,translate,type Lang} from '@/lib/i18n';

const LangContext=createContext<Lang>(DEFAULT_LANG);
export function I18nProvider({lang,children}:{lang:Lang;children:ReactNode}){return <LangContext.Provider value={lang}>{children}</LangContext.Provider>}
/** Translation helpers for the current language: t(text, vars), credits(n), statusLabel(s), date(ms). */
export function useI18n(){
 const lang=useContext(LangContext);
 return useMemo(()=>({lang,t:(text:string,vars?:Record<string,string|number>)=>translate(lang,text,vars),credits:(n:number)=>creditsText(lang,n),statusLabel:(s:string)=>statusText(lang,s),date:(n:number)=>dateText(lang,n)}),[lang]);
}
/** Shqip / English switch; the choice is kept in a cookie for a year. */
export function LanguageSwitch({className=''}:{className?:string}){
 const {lang}=useI18n();
 return <div className={'language-switch '+className} role="group" aria-label="Language / Gjuha">{LANGS.map(l=><button key={l.code} type="button" lang={l.code} aria-pressed={lang===l.code} className={lang===l.code?'active':''} onClick={()=>{document.cookie=`${LANG_COOKIE}=${l.code}; path=/; max-age=31536000; samesite=lax`;window.location.reload();}}>{l.label}</button>)}</div>;
}
