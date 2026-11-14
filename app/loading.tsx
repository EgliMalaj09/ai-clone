import {headers} from 'next/headers';
import {langFromCookie,translate} from '@/lib/i18n';
import {CardLoader} from '@/components/card-loader';
export default async function Loading(){const lang=langFromCookie((await headers()).get('cookie'));return <main className="page-shell"><div className="zero-loading" aria-live="polite"><CardLoader size={96} eager/><p>{translate(lang,'Opening your studio...')}</p></div></main>}
