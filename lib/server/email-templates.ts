// Branded transactional emails: sign-up verification and password reset (C6.1, C6.2), report decisions (C21.7) and finished creations (C11.2).
// Albanian and English (C6.3/C10): each email is written in the customer's language (users.locale).
// The brand name is a config value so swapping to the final brand (D5/C6.4) stays a one-line change.

import {translate,type Lang} from '../i18n';
export type AuthMailType='verify'|'reset';

type MailContent={subject:string;html:string;text:string};

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

const COPY:Record<AuthMailType,{subject:string;heading:string;lead:string;button:string;ignore:string}>= {
 verify:{
  subject:'Verify your {brand} email',
  heading:'Confirm your email',
  lead:'Thanks for creating an account. Confirm your email address to start making videos.',
  button:'Verify my email',
  ignore:'If you did not create this account, you can safely ignore this email.',
 },
 reset:{
  subject:'Reset your {brand} password',
  heading:'Reset your password',
  lead:'We received a request to reset your password. Choose a new one using the button below.',
  button:'Reset my password',
  ignore:'If you did not request a password reset, you can safely ignore this email — your password will not change.',
 },
};

// Business identity for the footer (D9). TODO(D9): confirm the legal name, address and contact before launch.
const BUSINESS_NAME='VASIL XHAJA';

type Notice={subject:string;heading:string;lead:string};
/** One branded notice email: heading, short paragraph, an optional button, support line and business footer. */
function noticeMail(copy:Notice,{brand,link,linkLabel,supportEmail,lang='en'}:{brand:string;link?:string;linkLabel?:string;supportEmail?:string;lang?:Lang}):MailContent{
 const support=supportEmail?.trim(),tr=(s:string,v?:Record<string,string>)=>translate(lang,s,v),open=linkLabel||tr('Open');
 const text=[copy.heading,'',copy.lead,...(link?['',`${open}: ${link}`]:[]),...(support?['',tr('Need help? Contact us at {email}.',{email:support})]:[]),'',`— ${brand}`,BUSINESS_NAME].join('\n');
 const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#0f1115;">
 <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(copy.lead)}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1115;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#171a21;border-radius:16px;border:1px solid #262b36;">
   <tr><td style="padding:32px 32px 8px;"><span style="font-family:'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:700;color:#fff;">${escape(brand)}</span></td></tr>
   <tr><td style="padding:8px 32px 0;"><h1 style="margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:22px;line-height:1.3;color:#fff;">${escape(copy.heading)}</h1>
    <p style="margin:0 0 20px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#aeb6c4;">${escape(copy.lead)}</p></td></tr>
   ${link?`<tr><td style="padding:0 32px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#6366f1;"><a href="${escape(link)}" style="display:inline-block;padding:12px 26px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px;">${escape(open)}</a></td></tr></table></td></tr>`:''}
   <tr><td style="padding:20px 32px 32px;"><hr style="border:none;border-top:1px solid #262b36;margin:0 0 16px;">${support?`<p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7482;">${escape(tr('Need help? Contact us at'))} <a href="mailto:${escape(support)}" style="color:#8b8ff5;">${escape(support)}</a>.</p>`:''}<p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#6b7482;">${escape(brand)} · ${escape(BUSINESS_NAME)}</p></td></tr>
  </table>
 </td></tr></table>
</body></html>`;
 return {subject:copy.subject,html,text};
}

export type ReportMailKind='approved'|'rejected_photo'|'rejected_other';
/** Email sent when an admin resolves a reported video (C21.7). */
export function reportMailContent(kind:ReportMailKind,{brand,templateName,detail,link,linkLabel,supportEmail,lang='en'}:{brand:string;templateName:string;detail?:string;link?:string;linkLabel?:string;supportEmail?:string;lang?:Lang}):MailContent{
 const tr=(s:string,v?:Record<string,string>)=>translate(lang,s,v),name={name:templateName};
 const copy=kind==='approved'
  ?{subject:tr('Good news about your “{name}” video',name),heading:tr('We’re remaking your video'),lead:tr('We reviewed your report about your “{name}” video and started a free redo with the same photo — at no credit cost. It will appear in My creations shortly.',name)}
  :kind==='rejected_photo'
  ?{subject:tr('About your “{name}” video',name),heading:tr('We reviewed your report'),lead:tr('We looked into your “{name}” video. The photo didn’t meet our photo guidelines, so we can’t offer a free redo this time. You can create a new video with a clearer photo.',name)+(detail?' ('+tr(detail)+')':'')}
  :{subject:tr('About your “{name}” video',name),heading:tr('We reviewed your report'),lead:tr('We reviewed your report about your “{name}” video.',name)+(detail?' '+detail:'')};
 return noticeMail(copy,{brand,link,linkLabel:linkLabel&&tr(linkLabel),supportEmail,lang});
}

export type GenerationMailKind='ready'|'failed'|'refused';
/** Email sent when a creation finishes (C11.2): ready to watch, or failed/refused with the credits returned. */
export function generationMailContent(kind:GenerationMailKind,{brand,templateName,credits,link,supportEmail,lang='en'}:{brand:string;templateName:string;credits:number;link:string;supportEmail?:string;lang?:Lang}):MailContent{
 const tr=(s:string,v?:Record<string,string>)=>translate(lang,s,v);
 const vars={name:templateName,amount:lang==='sq'?`${credits} ${credits===1?'kredit':'kredite'}`:`${credits} credit${credits===1?'':'s'}`};
 const copy=kind==='ready'
  ?{subject:tr('Your “{name}” video is ready',vars),heading:tr('Your video is ready'),lead:tr('Your “{name}” video has finished. Watch it, download it and share it from My creations. {amount} were spent on this video.',vars)}
  :kind==='refused'
  ?{subject:tr('Your “{name}” video could not be made',vars),heading:tr('Your video was refused'),lead:tr('Your “{name}” video was refused under the content rules, so it was not made. The {amount} reserved for it were returned to your balance. Please check the photo guidelines before trying again.',vars)}
  :{subject:tr('Your “{name}” video could not be completed',vars),heading:tr('Your video could not be completed'),lead:tr('Something went wrong while making your “{name}” video. The {amount} reserved for it were returned to your balance, so you can try again at no extra cost.',vars)};
 return noticeMail(copy,{brand,link,linkLabel:tr(kind==='ready'?'Watch my video':'Open My creations'),supportEmail,lang});
}
/** Builds the subject, HTML and plain-text bodies for an authentication email. */
export function authMailContent(type:AuthMailType,{brand,url,supportEmail,lang='en'}:{brand:string;url:string;supportEmail?:string;lang?:Lang}):MailContent{
 const tr=(s:string,v?:Record<string,string>)=>translate(lang,s,v);
 const raw=COPY[type],c={heading:tr(raw.heading),lead:tr(raw.lead),button:tr(raw.button),ignore:tr(raw.ignore)},safeUrl=escape(url),support=supportEmail?.trim();
 const subject=tr(raw.subject,{brand});
 const contactLine=support?tr('Need help? Contact us at {email}.',{email:support}):'';
 const text=[
  c.heading,
  '',
  c.lead,
  '',
  tr('Open this link within 30 minutes:'),
  url,
  '',
  c.ignore,
  ...(contactLine?[contactLine]:[]),
  '',
  `— ${brand}`,
  BUSINESS_NAME,
 ].join('\n');
 const html=`<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#0f1115;">
 <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(c.lead)}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1115;padding:32px 16px;">
  <tr><td align="center">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#171a21;border-radius:16px;overflow:hidden;border:1px solid #262b36;">
    <tr><td style="padding:32px 32px 8px;">
     <span style="display:inline-block;font-family:'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.3px;color:#ffffff;">${escape(brand)}</span>
    </td></tr>
    <tr><td style="padding:8px 32px 0;">
     <h1 style="margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:22px;line-height:1.3;color:#ffffff;">${escape(c.heading)}</h1>
     <p style="margin:0 0 24px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#aeb6c4;">${escape(c.lead)}</p>
    </td></tr>
    <tr><td style="padding:0 32px 8px;">
     <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#6366f1;">
      <a href="${safeUrl}" style="display:inline-block;padding:13px 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(c.button)}</a>
     </td></tr></table>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
     <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a93a3;">${escape(tr('This link expires in 30 minutes. If the button does not work, copy and paste this address into your browser:'))}</p>
     <p style="margin:0 0 20px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" style="color:#8b8ff5;">${safeUrl}</a></p>
     <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a93a3;">${escape(c.ignore)}</p>
    </td></tr>
    <tr><td style="padding:24px 32px 32px;">
     <hr style="border:none;border-top:1px solid #262b36;margin:0 0 16px;">
     ${support?`<p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7482;">${escape(tr('Need help? Contact us at'))} <a href="mailto:${escape(support)}" style="color:#8b8ff5;">${escape(support)}</a>.</p>`:''}
     <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7482;">${escape(brand)} · ${escape(BUSINESS_NAME)}</p>
    </td></tr>
   </table>
  </td></tr>
 </table>
</body>
</html>`;
 return {subject,html,text};
}
