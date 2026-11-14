// Seed the launch credit packs and welcome credits into D1 (D3.2, D3.4).
// Local (default): applies to the persisted local D1 used by `pnpm dev` and `pnpm start`.
//   pnpm seed:packs
// Production: applies to the remote D1 bound to this project (needs wrangler auth).
//   pnpm seed:packs -- --remote
// The SQL is idempotent, so re-running only fills in rows that are missing.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const remote=process.argv.includes('--remote');
const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
const db=config.d1_databases.find(d=>d.binding==='DB');
if(!db)throw new Error('Build the studio with the DB binding before seeding packs.');
await mkdir('.sites-runtime',{recursive:true});
const file=path.join(root,'.sites-runtime/seed-packs-config.json');
await writeFile(file,JSON.stringify({name:config.name,compatibility_date:config.compatibility_date,d1_databases:[db]}));
const args=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB',
 remote?'--remote':'--local','--config',file,'--file',path.join(root,'scripts/seed-packs.sql')];
if(!remote)args.push('--persist-to',path.join(root,'.wrangler/state'));
const result=spawnSync(process.execPath,args,{cwd:root,input:'y\n',stdio:['pipe','inherit','inherit']});
if(result.error)throw result.error;
process.exitCode=result.status??1;
