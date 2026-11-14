// V47 free trial: a new account's first video is free, rendered by the AI provider at 480p, with no watermark (D16).
// It uses no credits, so a failed trial cannot turn into spendable credits: a failed or refused trial video simply gives
// the trial back. One counts per account; refusals still add content strikes like any other video.
import {one,run} from './data';
import {isStaff,type StudioUser} from '../contracts';

export const TRIAL_RESOLUTION='480p';
/** A trial video that counts: anything but a failed or refused one (a deleted or expired video still counts). */
export const TRIAL_USED_SQL="EXISTS (SELECT 1 FROM generations WHERE user_id=? AND trial=1 AND status NOT IN ('failed','refused'))";

export async function trialEnabled(){return (await one("SELECT value FROM app_settings WHERE key='free_trial'"))?.value!=='off';}
export async function setTrialEnabled(on:boolean){await run("INSERT INTO app_settings (key,value) VALUES ('free_trial',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",on?'on':'off');}
/** True when this customer can make their free video now. */
export async function freeTrialAvailable(user:StudioUser|null){
 if(!user||isStaff(user.role)||!user.emailVerified||user.blocked||!await trialEnabled())return false;
 return !await one(`SELECT 1 AS used WHERE ${TRIAL_USED_SQL}`,user.id);
}
