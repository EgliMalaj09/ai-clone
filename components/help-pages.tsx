import {Fragment} from 'react';
import {ArrowLeft,Mail,Phone,Clock,ArrowUpRight,HelpCircle,Building2} from 'lucide-react';
import {BUSINESS,type SupportInfo} from '@/lib/contracts';
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

const FAQ:{title:string;items:[string,string][]}[]=[
 {title:'How it works',items:[
  ['How do I make a video?','Pick a template, upload a clear photo of yourself and press Generate. Your video appears in [My creations](/creations) when it is ready, and we email you too.'],
  ['How long does a video take?','Usually a few minutes, depending on the template and how busy the AI service is. You can close the page while you wait; the video keeps going and we email you when it is done.'],
  ['What do I get?','A video file in the format shown on the template page, which you can watch, download and share from My creations.'],
  ['Will the result look exactly like the example?','The examples show the style of each template. AI results vary from photo to photo, so your video will follow the same look but will not be identical.'],
 ]},
 {title:'Photos',items:[
  ['What makes a good photo?','One person, face clearly visible and looking at the camera, good light, no sunglasses or heavy filters, at least 512 × 512 pixels. The full list is in the photo guidelines on every template page and in the [Terms](/terms#photos).'],
  ['Can I use a photo of someone else?','Only if they agreed to it. Never upload photos of other people without their permission, photos of children, or photos of public figures.'],
  ['Why was my video refused?','The AI service checks every photo and result against its content rules. When it refuses one, the video is not made and its credits are returned to you. After 3 refusals the account can no longer upload or create videos. If you think a photo was refused by mistake, contact us.'],
 ]},
 {title:'Credits and payment',items:[
  ['How do credits work?','You buy a credit pack once (no subscription), and each template shows how many credits it costs before you start. See [Pricing](/pricing) for the packs.'],
  ['When are credits taken?','Starting a video reserves its credits. They are spent only when the video is delivered.'],
  ['Do credits expire?','No. Credits do not expire, but they cannot be exchanged for money or moved to another account.'],
  ['Can I get a refund?','Credit packs are not refundable once bought. If a video fails, its credits are returned automatically.'],
 ]},
 {title:'When something goes wrong',items:[
  ['My video failed. What happens to my credits?','They are returned to your balance automatically and we email you. You can try again right away.'],
  ['My video came out badly.','Open it in [My creations](/creations) and choose “Report a problem” within 7 days. If your photo followed the guidelines, we make one free redo with the same photo.'],
 ]},
 {title:'Privacy and your data',items:[
  ['Who can see my photos and videos?','Only you and the studio administrators. A video becomes visible to others only when you share a link to it or add it to the community gallery, and you can undo both at any time.'],
  ['How long do you keep my photos?','Photos that are not used for a video are deleted automatically after 24 hours. Photos and videos you keep stay in your account until you delete them.'],
  ['How do I delete my data?','Delete single videos from My creations and photos from [Account](/account), or delete your whole account there. You can also download a copy of all your data from Account first.'],
 ]},
];

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
