// Branded transactional emails for sign-up verification and password reset (C6.1, C6.2).
// English only for now (C6.3 adds Albanian with the site-wide translation, C10).
// The brand name is a config value so swapping to the final brand (D5/C6.4) stays a one-line change.

export type AuthMailType='verify'|'reset';

type MailContent={subject:string;html:string;text:string};

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

const COPY:Record<AuthMailType,{subject:(brand:string)=>string;heading:string;lead:string;button:string;ignore:string}>= {
 verify:{
  subject:brand=>`Verify your ${brand} email`,
  heading:'Confirm your email',
  lead:'Thanks for creating an account. Confirm your email address to start making videos.',
  button:'Verify my email',
  ignore:'If you did not create this account, you can safely ignore this email.',
 },
 reset:{
  subject:brand=>`Reset your ${brand} password`,
  heading:'Reset your password',
  lead:'We received a request to reset your password. Choose a new one using the button below.',
  button:'Reset my password',
  ignore:'If you did not request a password reset, you can safely ignore this email — your password will not change.',
 },
};

// Business identity for the footer (D9). TODO(D9): confirm the legal name, address and contact before launch.
const BUSINESS_NAME='VASIL XHAJA';

/** Builds the subject, HTML and plain-text bodies for an authentication email. */
export function authMailContent(type:AuthMailType,{brand,url,supportEmail}:{brand:string;url:string;supportEmail?:string}):MailContent{
 const c=COPY[type],safeUrl=escape(url),support=supportEmail?.trim();
 const subject=c.subject(brand);
 const contactLine=support?`Need help? Contact us at ${support}.`:'';
 const text=[
  c.heading,
  '',
  c.lead,
  '',
  'Open this link within 30 minutes:',
  url,
  '',
  c.ignore,
  ...(contactLine?[contactLine]:[]),
  '',
  `— ${brand}`,
  BUSINESS_NAME,
 ].join('\n');
 const html=`<!doctype html>
<html lang="en">
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
     <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a93a3;">This link expires in 30 minutes. If the button does not work, copy and paste this address into your browser:</p>
     <p style="margin:0 0 20px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" style="color:#8b8ff5;">${safeUrl}</a></p>
     <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a93a3;">${escape(c.ignore)}</p>
    </td></tr>
    <tr><td style="padding:24px 32px 32px;">
     <hr style="border:none;border-top:1px solid #262b36;margin:0 0 16px;">
     ${support?`<p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7482;">Need help? Contact us at <a href="mailto:${escape(support)}" style="color:#8b8ff5;">${escape(support)}</a>.</p>`:''}
     <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7482;">${escape(brand)} · ${escape(BUSINESS_NAME)}</p>
    </td></tr>
   </table>
  </td></tr>
 </table>
</body>
</html>`;
 return {subject,html,text};
}
