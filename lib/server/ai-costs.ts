import {z} from 'zod';
import {all,audit,must,now,one,run,uid} from './data';
import type {StudioUser} from '../contracts';

// Real AI cost tracking (V15): every completed step records its cost (what the provider reported, else the step's
// listed price). This page compares, per month, the recorded cost with the estimate used for prices and with the
// provider's real invoice that the admin types in.

const monthRange=(m:string)=>{const [y,mo]=m.split('-').map(Number);return [Date.UTC(y,mo-1,1),Date.UTC(y,mo,1)];};
const thisMonth=()=>new Date().toISOString().slice(0,7);

export async function aiCosts(url:URL){
 const month=url.searchParams.get('month')||thisMonth();must(/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Choose a month like 2026-10.');
 const [from,to]=monthRange(month);
 const [providers,templates,invoices]=await Promise.all([
  all("SELECT s.provider,COUNT(DISTINCT s.generation_id) AS videos,COUNT(*) AS steps,COALESCE(SUM(s.cost),0) AS cost,SUM(s.cost_source='provider') AS reported FROM generation_steps s WHERE s.status='completed' AND s.completed_at>=? AND s.completed_at<? GROUP BY s.provider ORDER BY cost DESC",from,to),
  all(`SELECT g.template_id,g.template_name,COUNT(*) AS videos,COALESCE(AVG(g.estimated_cost),0) AS estimated,COALESCE(AVG((SELECT SUM(s.cost) FROM generation_steps s WHERE s.generation_id=g.id AND s.status='completed')),0) AS recorded
   FROM generations g WHERE g.status='completed' AND g.completed_at>=? AND g.completed_at<? GROUP BY g.template_id ORDER BY videos DESC LIMIT 50`,from,to),
  all('SELECT provider,amount,note FROM provider_invoices WHERE month=?',month),
 ]);
 const invoice=new Map(invoices.map(i=>[i.provider as string,i]));
 // A provider with an invoice but no recorded steps still shows, so a bill for nothing stands out.
 for(const i of invoices)if(!providers.some(p=>p.provider===i.provider))providers.push({provider:i.provider,videos:0,steps:0,cost:0,reported:0});
 return {month,currency:'USD',
  providers:providers.map(p=>{const inv=invoice.get(p.provider as string);return {provider:p.provider as string,videos:Number(p.videos),steps:Number(p.steps),recorded:Number(p.cost),reportedByProvider:Number(p.reported||0),invoice:inv?Number(inv.amount):null,note:(inv?.note as string)||'',difference:inv?Number(inv.amount)-Number(p.cost):null};}),
  templates:templates.map(t=>({templateId:t.template_id as string,name:t.template_name as string,videos:Number(t.videos),estimated:Math.round(Number(t.estimated)),recorded:Math.round(Number(t.recorded))}))};
}
export async function saveInvoice(admin:StudioUser,input:unknown){
 const b=z.object({provider:z.enum(['higgsfield','fal','replicate']),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),amount:z.number().min(0).max(10000000),note:z.string().trim().max(200).default('')}).parse(input);
 const cents=Math.round(b.amount*100);
 await run('INSERT INTO provider_invoices (id,provider,month,amount,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(provider,month) DO UPDATE SET amount=excluded.amount,note=excluded.note',uid('inv_'),b.provider,b.month,cents,b.note,now());
 await audit(admin.id,'ai-costs.invoice',b.provider+':'+b.month);return {ok:!!await one('SELECT id FROM provider_invoices WHERE provider=? AND month=?',b.provider,b.month)};
}
