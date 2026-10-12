import {ArrowRight,Sparkles} from 'lucide-react';
import {useI18n} from './i18n';

// Public share page for one finished video (V3).
export type SharedVideo={id:string;templateName:string;templateSlug:string;thumbnail:string;completedAt:number;video:string;mime:string};
export function SharePage({share}:{share:SharedVideo}){
 const {t}=useI18n();
 return <article className="share-page"><div className="share-video"><video src={share.video} poster={share.thumbnail} controls playsInline loop preload="metadata"/></div><div className="share-copy"><span className="eyebrow">{t('MADE WITH ONE PHOTO')}</span><h1>{share.templateName}</h1><p>{t('This video was made with AI from a single photo. Pick the same look and make your own.')}</p><a className="button primary" href={'/template/'+share.templateSlug}><Sparkles size={17}/>{t('Make your own')}<ArrowRight size={17}/></a><a className="text-link" href="/explore">{t('Explore all templates')}</a></div></article>;
}
