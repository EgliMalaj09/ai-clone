import Link from 'next/link';
import {headers} from 'next/headers';
import {langFromCookie,translate} from '@/lib/i18n';
export const metadata={title:'Page not found | PROJECT STUDIO'};
export default async function NotFound(){const lang=langFromCookie((await headers()).get('cookie'));const t=(s:string)=>translate(lang,s);return <main className="signin-gate"><span className="eyebrow">PROJECT STUDIO</span><h1>{t('This scene is missing.')}</h1><p>{t('The template may be unavailable, or the link has changed.')}</p><Link className="button primary" href="/explore">{t('Explore templates')}</Link></main>}
