import {headers} from 'next/headers';
import {langFromCookie,translate} from '@/lib/i18n';
export default async function Loading(){const lang=langFromCookie((await headers()).get('cookie'));return <main className="page-shell"><div className="loading-stack" aria-live="polite"><p>{translate(lang,'Opening your studio...')}</p><div className="page-loading"/></div></main>}
