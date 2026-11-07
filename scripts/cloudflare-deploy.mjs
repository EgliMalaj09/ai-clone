// Deploy NgaZero to your own Cloudflare account (C33).
//
//   pnpm wrangler login              (once, in your own terminal)
//   pnpm cloudflare:deploy           (build, migrate, deploy)
//   pnpm cloudflare:deploy -- --origin https://ngazero.com   (after the domain is connected)
//   pnpm cloudflare:deploy -- --live (switch DEMO_MODE off; only when POK, Resend and Higgsfield are ready)
//
// What it does, every run:
//   1. Picks the Cloudflare account (cloudflare.json → accountId, or asks wrangler).
//   2. Creates the D1 database and the R2 bucket if they don't exist yet, and saves the IDs in cloudflare.json.
//   3. Builds with the real names (NGAZERO_DEPLOY=1).
//   4. Applies the D1 migrations in drizzle/ to the remote database.
//   5. Deploys the Worker.
//   6. First run only: generates APP_SECRET, QUEUE_SECRET and an admin password, keeps them in
//      .env.cloudflare (git-ignored, keep a copy in your password manager) and uploads them as Worker secrets.
import { spawnSync } from "node:child_process";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const originArg = flag("--origin");
const live = args.includes("--live");

const configFile = path.join(root, "cloudflare.json");
const secretsFile = path.join(root, ".env.cloudflare");
const cfg = JSON.parse(readFileSync(configFile, "utf8"));
const save = () => writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");

function wrangler(cmdArgs, { capture = false, allowFail = false, input } = {}) {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  if (cfg.accountId) env.CLOUDFLARE_ACCOUNT_ID = cfg.accountId;
  const r = spawnSync(process.execPath, ["./node_modules/wrangler/bin/wrangler.js", ...cmdArgs], {
    cwd: root, env, input, encoding: "utf8",
    stdio: capture ? ["pipe", "pipe", "pipe"] : [input ? "pipe" : "inherit", "inherit", "inherit"],
  });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) {
    if (capture) process.stderr.write((r.stdout || "") + (r.stderr || ""));
    throw new Error(`wrangler ${cmdArgs.join(" ")} failed (exit ${r.status}).`);
  }
  return r;
}
const step = (s) => console.log(`\n=== ${s}`);

// 1. Account
step("Cloudflare account");
const who = wrangler(["whoami"], { capture: true, allowFail: true });
const whoText = (who.stdout || "") + (who.stderr || "");
if (who.status !== 0 || /not authenticated|You are not logged in/i.test(whoText)) {
  console.error("You're not logged in to Cloudflare. Run `pnpm wrangler login` first, then try again.");
  process.exit(1);
}
if (!cfg.accountId) {
  const ids = [...whoText.matchAll(/│\s*(.+?)\s*│\s*([0-9a-f]{32})\s*│/g)].map((m) => ({ name: m[1], id: m[2] }));
  if (ids.length === 1) cfg.accountId = ids[0].id;
  else {
    console.error("Your login can see more than one Cloudflare account. Put the ID of the account that owns ngazero.com in cloudflare.json → accountId:");
    for (const a of ids) console.error(`  ${a.id}  ${a.name}`);
    process.exit(1);
  }
  save();
}
console.log(`Using account ${cfg.accountId}`);

// 2. D1 and R2
step("D1 database");
if (!cfg.d1.id) {
  const list = JSON.parse(wrangler(["d1", "list", "--json"], { capture: true }).stdout);
  let db = list.find((d) => d.name === cfg.d1.name);
  if (!db) {
    const out = wrangler(["d1", "create", cfg.d1.name], { capture: true }).stdout;
    const id = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    if (!id) throw new Error("Couldn't read the new database ID from wrangler:\n" + out);
    db = { uuid: id };
    console.log(`Created ${cfg.d1.name}`);
  }
  cfg.d1.id = db.uuid;
  save();
}
console.log(`${cfg.d1.name} = ${cfg.d1.id}`);

step("R2 bucket");
const bucket = wrangler(["r2", "bucket", "create", cfg.r2.bucket], { capture: true, allowFail: true });
const bucketText = (bucket.stdout || "") + (bucket.stderr || "");
if (bucket.status === 0) console.log(`Created ${cfg.r2.bucket}`);
else if (/already exists|10004/i.test(bucketText)) console.log(`${cfg.r2.bucket} already exists`);
else {
  process.stderr.write(bucketText);
  if (/10042|enable R2|purchase/i.test(bucketText))
    console.error("\nR2 isn't turned on for this account yet. In the Cloudflare dashboard open R2, click Enable (it asks for a card; the free tier is 10 GB/month), then run this again.");
  process.exit(1);
}

// 3. Build
step("Build");
{
  const r = spawnSync(process.execPath, ["scripts/run-framework.mjs", "build"], {
    cwd: root, stdio: "inherit", env: { ...process.env, NGAZERO_DEPLOY: "1" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const built = path.join(root, "dist/server/wrangler.json");

// 4. Migrations
step("D1 migrations (remote)");
{
  const b = JSON.parse(readFileSync(built, "utf8"));
  const db = b.d1_databases.find((d) => d.binding === "DB");
  mkdirSync(".sites-runtime", { recursive: true });
  const migConfig = path.join(root, ".sites-runtime/remote-d1-migrations.json");
  writeFileSync(migConfig, JSON.stringify({
    name: b.name, account_id: cfg.accountId, compatibility_date: b.compatibility_date,
    d1_databases: [{ ...db, migrations_dir: path.join(root, "drizzle") }],
  }));
  wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", migConfig], { input: "y\n" });
}

// 5. Deploy
step("Deploy");
const dep = wrangler(["deploy", "--config", built], { capture: true, allowFail: true });
process.stdout.write(dep.stdout);
if (dep.status !== 0) {
  process.stderr.write(dep.stderr || "");
  if (/workers\.dev subdomain/i.test((dep.stdout || "") + (dep.stderr || "")))
    console.error(`\nThis account has no workers.dev address yet. Pick one (free, once per account) at https://dash.cloudflare.com/${cfg.accountId}/workers/onboarding, then run this again.`);
  process.exit(1);
}
const url = dep.stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];

// 6. Secrets
step("Secrets");
const firstRun = !existsSync(secretsFile);
let secrets = {};
if (firstRun) {
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(32).toString("hex");
  const hash = "pbkdf2$100000$" + salt + "$" + pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  secrets = {
    APP_SECRET: randomBytes(32).toString("hex"),
    QUEUE_SECRET: randomBytes(32).toString("hex"),
    ADMIN_EMAIL: "admin@ngazero.com",
    ADMIN_PASSWORD_HASH: hash,
    ADMIN_PASSWORD_PLAIN: password, // only kept in .env.cloudflare, never uploaded
  };
} else {
  for (const line of readFileSync(secretsFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) secrets[m[1]] = m[2];
  }
}
secrets.DEMO_MODE = live ? "false" : (secrets.DEMO_MODE ?? "true");
secrets.APP_ORIGIN = originArg ?? secrets.APP_ORIGIN ?? url ?? "";
if (!secrets.APP_ORIGIN) console.warn("Couldn't find the workers.dev address; pass --origin https://... next time.");
writeFileSync(secretsFile,
  "# NgaZero Cloudflare secrets. Git-ignored. Keep a copy of APP_SECRET in your password manager (I4.2).\n" +
  Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
const upload = Object.fromEntries(Object.entries(secrets).filter(([k]) => k !== "ADMIN_PASSWORD_PLAIN"));
const tmp = path.join(root, ".sites-runtime/secrets-upload.json");
writeFileSync(tmp, JSON.stringify(upload), { mode: 0o600 });
try { wrangler(["secret", "bulk", tmp, "--name", cfg.workerName]); }
finally { writeFileSync(tmp, "{}"); }

console.log(`\nDone. ${secrets.APP_ORIGIN || url || ""}`);
console.log(`Mode: ${secrets.DEMO_MODE === "true" ? "demo (fake payments, sample videos)" : "live"}`);
if (firstRun) console.log("Admin sign-in: admin@ngazero.com, password in .env.cloudflare (ADMIN_PASSWORD_PLAIN). Change it after the first sign-in.");
