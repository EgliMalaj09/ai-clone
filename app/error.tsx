'use client';
import {langFromCookie,translate} from '@/lib/i18n';
// Client-only error screen: the language comes from the switcher cookie (C10).
export default function ErrorPage({reset}:{reset:()=>void}){const lang=typeof document==='undefined'?'sq':langFromCookie(document.cookie);const t=(s:string)=>translate(lang,s);return <main className="signin-gate"><span className="eyebrow">PROJECT STUDIO</span><h1>{t('A quick intermission.')}</h1><p>{t('The studio couldn’t load this page. Your saved work is safe.')}</p><button className="button primary" onClick={reset}>{t('Try again')}</button><a href="/">{t('Back to studio')}</a></main>}
