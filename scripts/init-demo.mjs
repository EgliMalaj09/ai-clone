import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const password=randomBytes(18).toString('base64url');
const salt=randomBytes(32).toString('hex');
const hash='pbkdf2$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
// Escape `$` so Wrangler's .env loader does not treat the hash segments as variable expansions.
const envHash=hash.replace(/\$/g,'\\$');
await writeFile('.env',`DEMO_MODE=true\nAPP_ORIGIN=http://localhost:5173\nAPP_SECRET=${randomBytes(32).toString('hex')}\nQUEUE_SECRET=${randomBytes(32).toString('hex')}\nADMIN_EMAIL=admin@project.studio\nADMIN_PASSWORD_HASH=${envHash}\n`,{flag:'wx',mode:0o600});
console.log('Local demo configured. Admin: admin@project.studio\nPassword: '+password+'\nStore this password securely.');
