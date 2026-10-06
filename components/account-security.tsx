'use client';
import type {Sessions} from '@/lib/api-types';
import {useState} from 'react';
import {Download,KeyRound,LogOut,ShieldCheck} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,Busy,Confirm,ErrorBox,Field} from './shared';
export function AccountSecurity({admin=false}:{admin?:boolean}){
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deletePassword,setDeletePassword]=useState('');
 const sessions=useAPI<Sessions>('account/sessions');
 async function change(e:React.FormEvent){
  e.preventDefault();setError('');if(password!==repeat){setError('The new passwords do not match.');return;}
  setBusy(true);try{await api('account/password','POST',{currentPassword:current,newPassword:password});setCurrent('');setPassword('');setRepeat('');await sessions.refresh();toast.success('Password changed. Other sessions have been signed out.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <><section className="panel"><h2><KeyRound size={21}/> Password & sessions</h2><p>Keep your account and personal photos secure.</p><form onSubmit={change}>
  <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></Field>
  <Field label="New password" hint="Use at least 10 characters."><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
  <Field label="Confirm new password"><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></Field>
  {error&&<ErrorBox message={error}/>}<button className="button primary small" disabled={busy}>{busy?<Busy/>:<KeyRound size={15}/>}Change password</button>
 </form><div className="session-settings"><ShieldCheck size={20}/><div><strong>{sessions.data?sessions.data.sessions.length+' active sign-in'+(sessions.data.sessions.length===1?'':'s'):'Your sign-in sessions'}</strong><p>Sessions expire after seven days. You can sign out other browsers now.</p></div></div>{sessions.error&&<ErrorBox message={sessions.error} retry={sessions.refresh}/>}<button className="button secondary small" onClick={async()=>{try{await api('account/sessions','DELETE');await sessions.refresh();toast.success('Other browsers have been signed out')}catch(e){toast.error((e as Error).message)}}}><LogOut size={15}/>Sign out other sessions</button></section>
 <section className="panel"><h2>Your data, in your hands.</h2><p>Download your profile, order history, upload list, and creation records as a JSON file. Download individual videos from My creations.</p><a href="/api/account/export" className="button secondary small"><Download size={16}/>Export my account data</a></section>
 {!admin&&<section className="panel danger-panel"><h3>Delete account</h3><p>Permanently remove your profile, photos, and videos. Financial records remain without your account details. Active generations must finish first.</p><Field label="Password to confirm account deletion"><input type="password" autoComplete="current-password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)}/></Field><Confirm title="Permanently delete your account?" description="Your profile and files will be removed. This cannot be undone." onConfirm={async()=>{await api('account','DELETE',{password:deletePassword});window.location.assign('/')}}><button className="button danger-outline small" disabled={!deletePassword}>Delete my account</button></Confirm></section>}
 </>;
}
