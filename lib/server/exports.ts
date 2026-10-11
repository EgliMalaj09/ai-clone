import {all,audit,must,type Row} from './data';

// CSV exports for the admin (V12): credit purchases, the credit ledger and users. Opens in Excel/Numbers/Sheets.

type Column=[header:string,value:(r:Row)=>unknown];
/** One CSV cell: quoted when needed, and a leading = + - @ is neutralised so a spreadsheet never runs it as a formula. */
export function csvCell(v:unknown){let s=v===null||v===undefined?'':String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
export const toCsv=(rows:Row[],columns:Column[])=>[columns.map(c=>csvCell(c[0])).join(','),...rows.map(r=>columns.map(c=>csvCell(c[1](r))).join(','))].join('\r\n')+'\r\n';
const iso=(ms:unknown)=>ms?new Date(Number(ms)).toISOString():'';
const major=(minor:unknown)=>(Number(minor||0)/100).toFixed(2);
const LIMIT=100000;

const exports:Record<string,{sql:string;columns:Column[]}>={
 purchases:{sql:`SELECT p.*,u.email FROM credit_purchases p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT ${LIMIT}`,columns:[
  ['Purchase ID',r=>r.id],['Created',r=>iso(r.created_at)],['Paid',r=>iso(r.paid_at)],['Customer email',r=>r.email??'(deleted account)'],['Pack',r=>r.package_name],['Credits',r=>r.credits],['Amount',r=>major(r.amount)],['Currency',r=>r.currency],['Status',r=>r.status],['Provider',r=>r.provider],['Provider order',r=>r.provider_session_id],['Provider transaction',r=>r.provider_transaction_id]]},
 ledger:{sql:`SELECT t.id,t.kind,t.reason,t.reference_type,t.reference_id,t.created_at,u.email,
  COALESCE(SUM(CASE WHEN e.account='user:'||t.user_id||':available' THEN e.amount END),0) AS available_change,
  COALESCE(SUM(CASE WHEN e.account='user:'||t.user_id||':held' THEN e.amount END),0) AS held_change,
  MAX(CASE WHEN e.account='user:'||t.user_id||':available' THEN e.balance_after END) AS available_after
  FROM credit_transactions t LEFT JOIN users u ON u.id=t.user_id JOIN credit_entries e ON e.transaction_id=t.id GROUP BY t.id ORDER BY t.created_at DESC,t.id DESC LIMIT ${LIMIT}`,columns:[
  ['Transaction ID',r=>r.id],['Date',r=>iso(r.created_at)],['Type',r=>r.kind],['Customer email',r=>r.email??'(deleted account)'],['Available change',r=>r.available_change],['Reserved change',r=>r.held_change],['Available after',r=>r.available_after??''],['Reason',r=>r.reason],['Reference type',r=>r.reference_type],['Reference ID',r=>r.reference_id]]},
 users:{sql:`SELECT u.*,COALESCE(b.available,0) AS available,COALESCE(b.held,0) AS held FROM users u LEFT JOIN credit_balances b ON b.user_id=u.id ORDER BY u.created_at DESC LIMIT ${LIMIT}`,columns:[
  ['User ID',r=>r.id],['Email',r=>r.email],['Name',r=>r.name],['Role',r=>r.role],['Status',r=>r.status],['Email verified',r=>r.email_verified?'yes':'no'],['Joined',r=>iso(r.created_at)],['Language',r=>r.locale],['Marketing emails',r=>r.marketing_opt_in?'yes':'no'],['Marketing consent at',r=>iso(r.marketing_opt_in_at)],['Terms version',r=>r.terms_version],['Credits available',r=>r.available],['Credits reserved',r=>r.held],['Content refusals',r=>r.content_strikes],['Blocked',r=>r.blocked_at?iso(r.blocked_at):''],['Two-step sign-in',r=>r.totp_enabled_at?'on':'off']]},
};

export async function adminExport(kind:string,adminId:string){
 const e=exports[kind];must(e,'Unknown export.',404);
 const csv='﻿'+toCsv(await all(e.sql),e.columns);
 await audit(adminId,'export.'+kind,kind);
 const day=new Date().toISOString().slice(0,10);
 return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="studio-${kind}-${day}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
