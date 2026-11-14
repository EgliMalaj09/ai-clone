// Albanian coverage check (C10): every English line the customer-facing code passes to t()/tr()/translate() must have
// an Albanian line in lib/i18n-sq.ts, and each Albanian line must keep the same {placeholders}. Runs on source files.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const sqSource=await readFile('lib/i18n-sq.ts','utf8');
const dict=new Map();
for(const m of sqSource.matchAll(/^\s+'((?:[^'\\]|\\.)*)':'((?:[^'\\]|\\.)*)',$/gm))dict.set(m[1].replace(/\\'/g,"'"),m[2].replace(/\\'/g,"'"));

const files=[...(await readdir('components')).filter(f=>f.endsWith('.tsx')&&!f.startsWith('admin')).map(f=>'components/'+f),'app/not-found.tsx','app/error.tsx','app/loading.tsx','app/[[...path]]/page.tsx','lib/server/email-templates.ts'];
function callArgs(s,open){let depth=0,q=null;for(let i=open;i<s.length;i++){const c=s[i];if(q){if(c==='\\'){i++;continue}if(c===q)q=null;continue}if(c==="'"||c==='`'||c==='"'){q=c;continue}if(c==='(')depth++;else if(c===')'&&--depth===0)return s.slice(open+1,i);}return ''}
const used=new Map();
for(const file of files){
 const s=await readFile(file,'utf8');
 for(const m of s.matchAll(/(?<![\w.])(?:t|tr|translate)\(/g)){
  const args=callArgs(s,m.index+m[0].length-1).replace(/\{[^{}]*:[^{}]*\}/g,'');
  for(const l of args.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)){
   const text=l[1].replace(/\\'/g,"'");
   if(!/[A-Za-z]/.test(text)||(!text.includes(' ')&&/^[a-z/]/.test(text)&&text!=='and'))continue;
   if(!used.has(text))used.set(text,file);
  }
 }
}
const missing=[...used].filter(([text])=>!dict.has(text));
const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
const broken=[...dict].filter(([en,sq])=>placeholders(en)!==placeholders(sq));
for(const [text,file] of missing)console.log('MISSING',file,'::',text);
for(const [en] of broken)console.log('PLACEHOLDERS',en);
await mkdir('test-results',{recursive:true});
await writeFile('test-results/i18n.json',JSON.stringify({date:new Date().toISOString(),lines:dict.size,used:used.size,missing:missing.length,brokenPlaceholders:broken.length},null,2));
assert.equal(missing.length,0,missing.length+' customer-facing lines have no Albanian translation');
assert.equal(broken.length,0,broken.length+' Albanian lines change the {placeholders}');
console.log(`\n${used.size} customer-facing lines checked; all have Albanian (${dict.size} lines in the dictionary).`);
