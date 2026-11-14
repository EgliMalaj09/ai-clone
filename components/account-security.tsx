'use client';
import qrcode from 'qrcode-generator';
import type {Sessions,SignInMethods} from '@/lib/api-types';
import {useEffect,useState} from 'react';
import {Check,Copy,Download,KeyRound,Link2,LogOut,ShieldCheck,Smartphone} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,Busy,Confirm,ErrorBox,Field} from './shared';
import {useI18n} from './i18n';
type TwoStep={enabled:boolean;enabledAt:number|null;recoveryCodesLeft:number};
const providerName={google:'Google',apple:'Apple'} as const;
/** True when the owner check can be sent: a typed password, or for a Google/Apple-only account a recent sign-in (V49). */
export const ownerReady=(m:SignInMethods|null|undefined,password:string)=>!m||m.hasPassword?!!password:m.recentSignIn;
/** Without a password, a sensitive change needs a fresh sign-in through Google or Apple. */
function ReauthNote({methods}:{methods:SignInMethods}){
 const {t}=useI18n();const connected=methods.providers.filter(p=>p.connected&&p.available);
 return <div className="reauth-note"><p>{t('Your account has no password. To confirm it’s you, sign in again with Google or Apple, then come back here within 10 minutes.')}</p><div className="button-row">{connected.map(p=><a key={p.provider} className="button secondary small" href={'/api/auth/oauth/'+p.provider+'?next=/account'}>{t('Sign in again with {provider}',{provider:providerName[p.provider]})}</a>)}</div></div>;
}
/** The proof asked before a sensitive change: the password field, or the re-sign-in note for accounts without one. */
export function OwnerProof({methods,label,value,onChange}:{methods?:SignInMethods|null;label:string;value:string;onChange:(v:string)=>void}){
 if(!methods||methods.hasPassword)return <Field label={label}><input type="password" autoComplete="current-password" required maxLength={128} value={value} onChange={e=>onChange(e.target.value)}/></Field>;
 return methods.recentSignIn?null:<ReauthNote methods={methods}/>;
}
const connectErrors:Record<string,string>={in_use:'This Google or Apple account is already used by another account here.',already:'This sign-in is already connected.',cancelled:'Connecting was cancelled.',suspended:'This account is suspended. Contact the studio administrator.'};
/** Account → Sign-in methods: password plus Google/Apple, connected and disconnected here (V49). */
function SignInMethodsPanel({methods,refresh}:{methods?:SignInMethods|null;refresh:()=>Promise<unknown>|void}){
 const {t}=useI18n();const [password,setPassword]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{const q=new URLSearchParams(window.location.search),ok=q.get('connected'),bad=q.get('connect_error');if(!ok&&!bad)return;
  if(ok)toast.success(t('{provider} is connected. You can now sign in with it too.',{provider:providerName[ok as 'google']||ok}));else toast.error(t(connectErrors[bad||'']||'We could not connect that sign-in. Please try again.'));
  q.delete('connected');q.delete('connect_error');window.history.replaceState(null,'',window.location.pathname+(q.size?'?'+q:''));},[t]);
 if(!methods||!methods.providers.length)return null;
 const connectedCount=methods.providers.filter(p=>p.connected).length,ready=ownerReady(methods,password);
 async function act(provider:'google'|'apple',connect:boolean){setBusy(provider);try{
  if(connect){const r=await api<{url:string}>('account/sign-in-methods/'+provider+'/connect','POST',{password});window.location.assign(r.url);return;}
  await api('account/sign-in-methods/'+provider,'DELETE',{password});setPassword('');await refresh();toast.success(t('{provider} sign-in removed',{provider:providerName[provider]}));
 }catch(e){toast.error(t((e as Error).message))}finally{setBusy('')}}
 return <section className="panel" id="sign-in-methods"><h2><Link2 size={21}/> {t('Sign-in methods')}</h2><p>{t('Use your email and password, Google or Apple — whichever you prefer. Two-step sign-in, if on, applies to all of them.')}</p>
  <ul className="sign-in-methods">
   <li><KeyRound size={17}/><strong>{t('Email and password')}</strong><span className={methods.hasPassword?'method-on':'method-off'}>{methods.hasPassword?<><Check size={14}/> {t('Set')}</>:t('Not set yet — set one below')}</span></li>
   {methods.providers.map(p=><li key={p.provider}><span className={'oauth-dot oauth-'+p.provider} aria-hidden="true"/><strong>{providerName[p.provider]}</strong>
    {p.connected?<><span className="method-on"><Check size={14}/> {t('Connected')}</span>{(methods.hasPassword||connectedCount>1)&&<button className="text-button" disabled={!!busy||!ready} onClick={()=>act(p.provider,false)}>{t('Disconnect')}</button>}</>
     :p.available?<button className="button secondary small" disabled={!!busy||!ready} onClick={()=>act(p.provider,true)}>{busy===p.provider?<Busy/>:t('Connect {provider}',{provider:providerName[p.provider]})}</button>:<span className="method-off">{t('Not available right now')}</span>}</li>)}
  </ul>
  {!methods.hasPassword&&connectedCount<2&&<p className="subtle-note">{t('Set a password or connect another sign-in before removing this one, so you can always get into your account.')}</p>}
  <OwnerProof methods={methods} label={t('Your password, to connect or disconnect')} value={password} onChange={setPassword}/>
 </section>;
}
/** Two-step sign-in with an authenticator app (C4.1). */
function TwoStepPanel({methods}:{methods?:SignInMethods|null}){
 const {t,date}=useI18n();
 const status=useAPI<TwoStep>('account/mfa');const [password,setPassword]=useState(''),[code,setCode]=useState(''),[setup,setSetup]=useState<{secret:string;uri:string}|null>(null),[codes,setCodes]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<'idle'|'disable'|'recovery'>('idle');
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const reset=()=>{setPassword('');setCode('');setMode('idle')};
 const d=status.data;
 return <section className="panel" id="two-step"><h2><Smartphone size={21}/> {t('Two-step sign-in')}</h2>
  {!d?(status.error?<ErrorBox message={status.error} retry={status.refresh}/>:<Busy/>):
  codes.length?<><p><strong>{t('Save these recovery codes now.')}</strong> {t('Each one works once if you lose your phone. They won’t be shown again.')}</p><ul className="recovery-codes">{codes.map(c=><li key={c}><code>{c}</code></li>)}</ul><div className="button-row"><button className="button secondary small" onClick={()=>{void navigator.clipboard?.writeText(codes.join('\n'));toast.success(t('Recovery codes copied'))}}><Copy size={15}/>{t('Copy codes')}</button><button className="button primary small" onClick={()=>{setCodes([]);void status.refresh()}}>{t('I’ve saved them')}</button></div></>:
  d.enabled?<><p className="two-step-on"><ShieldCheck size={17}/> {t('On since {date}. Signing in asks for a code from your authenticator app.',{date:date(d.enabledAt||0)})} {t(d.recoveryCodesLeft===1?'1 recovery code left.':'{n} recovery codes left.',{n:d.recoveryCodesLeft})}</p>
   {mode==='idle'?<div className="button-row"><button className="button secondary small" onClick={()=>setMode('recovery')}>{t('New recovery codes')}</button><button className="button danger-outline small" onClick={()=>setMode('disable')}>{t('Turn off')}</button></div>:
   <form onSubmit={e=>{e.preventDefault();void run(async()=>{const r=await api<{recoveryCodes?:string[]}>('account/mfa/'+mode,'POST',{password,code});reset();if(r.recoveryCodes)setCodes(r.recoveryCodes);else toast.success(t('Two-step sign-in is off'));await status.refresh();})}}><OwnerProof methods={methods} label={t('Your password')} value={password} onChange={setPassword}/><Field label={t('Code from your app (or a recovery code)')}><input value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" maxLength={20} required/></Field>{error&&<ErrorBox message={error}/>}<div className="button-row"><button className={'button small '+(mode==='disable'?'danger-outline':'primary')} disabled={busy}>{busy?<Busy/>:t(mode==='disable'?'Turn off two-step sign-in':'Create new recovery codes')}</button><button type="button" className="text-button" onClick={reset}>{t('Cancel')}</button></div></form>}</>:
  setup?<form onSubmit={e=>{e.preventDefault();void run(async()=>{const r=await api<{recoveryCodes:string[]}>('account/mfa/enable','POST',{code});setSetup(null);setCode('');setCodes(r.recoveryCodes);toast.success(t('Two-step sign-in is on'));})}}><ol className="two-step-steps"><li>{t('Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).')}</li><li>{t('Scan this QR code with your authenticator app:')}<SetupQr uri={setup.uri} label={t('QR code for two-step sign-in')}/>{t('Can’t scan it? In the app choose “Other account” and type this key:')} <code className="setup-key">{setup.secret}</code> <a className="text-link" href={setup.uri}>{t('or open it in the app on this phone')}</a></li><li>{t('Enter the 6-digit code it shows.')}</li></ol><Field label={t('6-digit code')}><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></Field>{error&&<ErrorBox message={error}/>}<div className="button-row"><button className="button primary small" disabled={busy||code.length!==6}>{busy?<Busy/>:t('Turn on')}</button><button type="button" className="text-button" onClick={()=>{setSetup(null);setCode('')}}>{t('Cancel')}</button></div></form>:
  <><p>{t('Add a code from your phone when you sign in, so a stolen password alone can’t open your account.')}</p><form onSubmit={e=>{e.preventDefault();void run(async()=>{setSetup(await api<{secret:string;uri:string}>('account/mfa/setup','POST',{password}));setPassword('');})}}><OwnerProof methods={methods} label={t('Your password')} value={password} onChange={setPassword}/>{error&&<ErrorBox message={error}/>}<button className="button primary small" disabled={busy||!ownerReady(methods,password)}>{busy?<Busy/>:t('Set up two-step sign-in')}</button></form></>}
 </section>;
}
export function AccountSecurity({admin=false}:{admin?:boolean}){
 const {t}=useI18n();
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deletePassword,setDeletePassword]=useState('');
 const sessions=useAPI<Sessions>('account/sessions'),methods=useAPI<SignInMethods>('account/sign-in-methods');
 const m=methods.data,noPassword=!!m&&!m.hasPassword;
 async function change(e:React.FormEvent){
  e.preventDefault();setError('');if(password!==repeat){setError(t('The new passwords do not match.'));return;}
  setBusy(true);try{await api('account/password','POST',{currentPassword:noPassword?undefined:current,newPassword:password});setCurrent('');setPassword('');setRepeat('');await Promise.all([sessions.refresh(),methods.refresh()]);toast.success(t(noPassword?'Password set. You can now also sign in with your email and password.':'Password changed. Other sessions have been signed out.'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <><SignInMethodsPanel methods={m} refresh={methods.refresh}/><section className="panel"><h2><KeyRound size={21}/> {t('Password & sessions')}</h2><p>{t(noPassword?'Your account signs in with Google or Apple. Set a password to also sign in with your email.':'Keep your account and personal photos secure.')}</p><form onSubmit={change}>
  {noPassword?<OwnerProof methods={m} label="" value="" onChange={()=>{}}/>:<Field label={t('Current password')}><input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></Field>}
  <Field label={t('New password')} hint={t('Use at least 10 characters.')}><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
  <Field label={t('Confirm new password')}><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></Field>
  {error&&<ErrorBox message={error}/>}<button className="button primary small" disabled={busy||(noPassword&&!m.recentSignIn)}>{busy?<Busy/>:<KeyRound size={15}/>}{t(noPassword?'Set password':'Change password')}</button>
 </form><div className="session-settings"><ShieldCheck size={20}/><div><strong>{sessions.data?t(sessions.data.sessions.length===1?'1 active sign-in':'{n} active sign-ins',{n:sessions.data.sessions.length}):t('Your sign-in sessions')}</strong><p>{t('Sessions expire after seven days. You can sign out other browsers now.')}</p></div></div>{sessions.error&&<ErrorBox message={sessions.error} retry={sessions.refresh}/>}<button className="button secondary small" onClick={async()=>{try{await api('account/sessions','DELETE');await sessions.refresh();toast.success(t('Other browsers have been signed out'))}catch(e){toast.error(t((e as Error).message))}}}><LogOut size={15}/>{t('Sign out other sessions')}</button></section>
 <TwoStepPanel methods={m}/>
 <section className="panel"><h2>{t('Your data, in your hands.')}</h2><p>{t('Download your profile, consents, credit history, purchases, reports and creation records as a JSON file, with download links to every photo and video you have with us (the links work for 23 hours).')}</p><a href="/api/account/export" className="button secondary small"><Download size={16}/>{t('Export my account data')}</a></section>
 {!admin&&<section className="panel danger-panel"><h3>{t('Delete account')}</h3><p>{t('Permanently remove your profile, photos, and videos. Financial records remain without your account details. Active generations must finish first.')}</p><OwnerProof methods={m} label={t('Password to confirm account deletion')} value={deletePassword} onChange={setDeletePassword}/><Confirm title={t('Permanently delete your account?')} description={t('Your profile and files will be removed. This cannot be undone.')} onConfirm={async()=>{await api('account','DELETE',{password:deletePassword||undefined});window.location.assign('/')}}><button className="button danger-outline small" disabled={!ownerReady(m,deletePassword)}>{t('Delete my account')}</button></Confirm></section>}
 </>;
}

/** The setup link as a QR code, drawn in the browser: the secret never goes to an outside service. */
function SetupQr({uri,label}:{uri:string;label:string}){
 const qr=qrcode(0,'M');qr.addData(uri);qr.make();
 const size=qr.getModuleCount()*4+16;// whole pixels per module keep the code sharp for the phone camera
 return <img className="setup-qr" src={qr.createDataURL(4,8)} alt={label} width={size} height={size}/>;
}
