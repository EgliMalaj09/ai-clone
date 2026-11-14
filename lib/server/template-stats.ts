import {all,must,now} from './data';

// Template statistics (V34): views, creations, success rate, average generation time and credits earned, per template.
export async function templateStats(url:URL){
 const days=url.searchParams.get('days')||'30';must(['7','30','90','all'].includes(days),'Choose 7, 30, 90 days or all time.');
 const since=days==='all'?0:now()-Number(days)*86400000;
 const [views,gens]=await Promise.all([
  all("SELECT json_extract(metadata,'$.templateId') AS template_id,COUNT(*) AS views FROM analytics_events WHERE name='template_view' AND created_at>=? GROUP BY template_id",since),
  // Free redos (report_id) are not new sales, so they don't count as credits earned.
  all(`SELECT template_id,COUNT(*) AS creations,SUM(status='completed') AS completed,SUM(status IN ('failed','refused')) AS failed,SUM(status='refused') AS refused,
   AVG(CASE WHEN status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL THEN completed_at-started_at END) AS avg_ms,
   SUM(CASE WHEN status='completed' AND report_id IS NULL THEN credit_cost ELSE 0 END) AS credits FROM generations WHERE created_at>=? GROUP BY template_id`,since),
 ]);
 const out:Record<string,{views:number;creations:number;completed:number;failed:number;refused:number;successRate:number|null;avgSeconds:number|null;credits:number;conversion:number|null}>={};
 const row=(id:string)=>out[id]??={views:0,creations:0,completed:0,failed:0,refused:0,successRate:null,avgSeconds:null,credits:0,conversion:null};
 for(const v of views)if(v.template_id)row(v.template_id as string).views=Number(v.views);
 for(const g of gens){const r=row(g.template_id as string);r.creations=Number(g.creations);r.completed=Number(g.completed||0);r.failed=Number(g.failed||0);r.refused=Number(g.refused||0);r.credits=Number(g.credits||0);
  const finished=r.completed+r.failed;r.successRate=finished?r.completed/finished:null;r.avgSeconds=g.avg_ms===null?null:Math.round(Number(g.avg_ms)/1000);}
 for(const r of Object.values(out))r.conversion=r.views?r.creations/r.views:null;
 return {days,stats:out};
}
