// Spending safety limits (C23): protect against a bug or abuse running up AI cost.
// Per customer: how many videos may run at once and how many may start per day.
// Studio-wide: a daily estimated-AI-cost ceiling that pauses creation and records an alert event.
import {all,event,must,now,one} from './data';

export const LIMIT_DEFAULTS={concurrent:3,daily:20,studioDailyCost:0};// studioDailyCost 0 = off; cost in the template currency's minor units
const DAY_MS=86400000;

export async function spendingLimits(){
 const rows=await all("SELECT key,value FROM app_settings WHERE key IN ('limit_user_concurrent','limit_user_daily','limit_studio_daily_cost')");
 const get=(k:string,d:number)=>{const v=rows.find(r=>r.key===k)?.value;return v===undefined?d:Math.max(0,Math.trunc(Number(v))||0);};
 return {concurrent:get('limit_user_concurrent',LIMIT_DEFAULTS.concurrent),daily:get('limit_user_daily',LIMIT_DEFAULTS.daily),studioDailyCost:get('limit_studio_daily_cost',LIMIT_DEFAULTS.studioDailyCost)};
}

/** Enforced before a new creation reserves credits. A 0 limit means "no limit" for that dimension. */
export async function assertWithinLimits(userId:string,adding=1){
 const l=await spendingLimits(),dayAgo=now()-DAY_MS;
 if(l.concurrent>0){
  const c=await one("SELECT COUNT(*) AS n FROM generations WHERE user_id=? AND deleted_at IS NULL AND status IN ('queued','preparing','generating','finalizing')",userId);
  // `adding` > 1 checks room for several videos at once (V21).
  must(Number(c?.n||0)+adding-1<l.concurrent,`You already have ${l.concurrent} video${l.concurrent>1?'s':''} in progress. Please wait for one to finish.`,429);
 }
 if(l.daily>0){
  const d=await one('SELECT COUNT(*) AS n FROM generations WHERE user_id=? AND created_at>=?',userId,dayAgo);
  must(Number(d?.n||0)+adding-1<l.daily,`You’ve reached today’s limit of ${l.daily} videos. Please try again tomorrow.`,429);
 }
 if(l.studioDailyCost>0){
  const s=await one('SELECT COALESCE(SUM(estimated_cost),0) AS c FROM generations WHERE created_at>=? AND deleted_at IS NULL',dayAgo);
  if(Number(s?.c||0)>=l.studioDailyCost){
   await event('spend_cap_reached',null,{sum:Number(s?.c||0),cap:l.studioDailyCost}).catch(()=>{});
   must(false,'Video creation is paused for today while we review capacity. Please check back soon.',503);
  }
 }
}
