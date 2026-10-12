import {Fragment} from 'react';
import {ArrowLeft,Mail,Phone,Clock,ArrowUpRight,HelpCircle,Building2} from 'lucide-react';
import {BUSINESS,type SupportInfo} from '@/lib/contracts';
import {FAQ} from '@/lib/faq';
import {useI18n} from './i18n';

// Help pages (C26): an FAQ and a Contact page, linked from the footer. Support details come from Admin → Settings.
// Answers are whole sentences with [link text](/path) markup, so each one translates as a unit (C10).

const socials=(s?:SupportInfo)=>s?([['Instagram',s.instagram],['TikTok',s.tiktok],['Facebook',s.facebook]] as const).filter(([,url])=>url):[];

/** Footer links to the studio's social accounts; nothing is shown until they are set in Admin → Settings. */
export function SocialLinks({support}:{support?:SupportInfo}){
 return <>{socials(support).map(([name,url])=><a key={name} href={url} target="_blank" rel="noopener noreferrer">{name}</a>)}</>;
}

/** Renders text with [label](/internal-path) links; only site-internal paths become links. */
function Linked({text}:{text:string}){
 const parts=text.split(/(\[[^\]]+\]\(\/[^)\s]*\))/);
 return <>{parts.map((p,i)=>{const m=p.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);return m?<a key={i} href={m[2]}>{m[1]}</a>:<Fragment key={i}>{p}</Fragment>;})}</>;
}


export function FaqPage({support}:{support?:SupportInfo}){
 const {t}=useI18n();
 return <article className="legal-page help-page"><a className="back-link" href="/"><ArrowLeft size={16}/>{t('Back to studio')}</a><span className="eyebrow">{t('HELP & FAQ')}</span><h1>{t('Questions, answered.')}</h1>
  {FAQ.map(group=><section key={group.title}><h2>{t(group.title)}</h2>{group.items.map(([q,a])=><details className="faq-item" key={q}><summary>{t(q)}</summary><p><Linked text={t(a)}/></p></details>)}</section>)}
  <div className="help-cta"><HelpCircle size={20}/><div><strong>{t('Still need help?')}</strong><p>{support?.email?<>{t('Write to us at')} <a href={'mailto:'+support.email}>{support.email}</a>.</>:<Linked text={t('Visit the [Contact page](/contact).')}/>}</p></div></div>
 </article>;
}

export function ContactPage({support}:{support?:SupportInfo}){
 const {t}=useI18n();const links=socials(support);
 return <article className="legal-page help-page"><a className="back-link" href="/"><ArrowLeft size={16}/>{t('Back to studio')}</a><span className="eyebrow">{t('CONTACT')}</span><h1>{t('We’re here to help.')}</h1>
  <p><Linked text={t('Questions about a video, credits or your account? Many answers are in the [Help & FAQ](/faq). For anything else, contact us directly.')}/></p>
  <div className="contact-list">
   {support?.email?<a className="contact-row" href={'mailto:'+support.email}><Mail size={20}/><div><strong>{t('Email')}</strong><span>{support.email}</span></div></a>:<div className="contact-row"><Mail size={20}/><div><strong>{t('Email')}</strong><span>{t('Our support address will be listed here soon.')}</span></div></div>}
   {support?.phone&&<a className="contact-row" href={'tel:'+support.phone.replace(/[^+\d]/g,'')}><Phone size={20}/><div><strong>{t('Phone')}</strong><span>{support.phone}</span></div></a>}
   {support?.responseTime&&<div className="contact-row"><Clock size={20}/><div><strong>{t('Response time')}</strong><span>{support.responseTime}</span></div></div>}
   <div className="contact-row"><Building2 size={20}/><div><strong>{t('Business')}</strong><span>{BUSINESS.name}, {t(BUSINESS.country)}</span></div></div>
  </div>
  {links.length>0&&<><h2>{t('Follow us')}</h2><div className="social-row">{links.map(([name,url])=><a key={name} className="button secondary small" href={url} target="_blank" rel="noopener noreferrer">{name}<ArrowUpRight size={15}/></a>)}</div></>}
  <h2>{t('When you write about a video')}</h2><p>{t('Include the email of your account and the name of the template, so we can find it quickly. Never send your password.')}</p>
 </article>;
}
