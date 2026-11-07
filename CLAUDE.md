# NgaZero: rules for Claude

NgaZero is live on Cloudflare (account `90d9618247c19f91521e6dda5072b54a`, Worker `ngazero`, D1 `ngazero-db`, R2 `ngazero-media`) at https://ngazero.ngazero.workers.dev. The domain is ngazero.com. Deploy with `pnpm cloudflare:deploy` (see docs/OPERATIONS.md). The launch plan is LAUNCH-CHECKLIST.md.

## Hard rules

These are never broken, even when a task seems to need it. Each approval covers one action only; ask again next time.

### Live site and data
1. **Ask before every deploy.** No `pnpm cloudflare:deploy`, `wrangler deploy` or `wrangler secret …` without the owner's explicit yes. Make changes locally and say they are not deployed. Before deploying, ask whether to run typecheck, lint and tests (default: run them).
2. **Ask before every change to the live database or storage.** No INSERT/UPDATE/DELETE, seeding, migrations, or deleting users or files in remote D1/R2 without an explicit yes. Say exactly what will change first. Read-only queries (SELECT) are fine.
3. **Back up the live database before any migration or delete** (`wrangler d1 export ngazero-db --remote --output <file>`), so it can be undone.
4. **Never touch real customer accounts.** Test only with the owner's own accounts (e.g. `ngazero2026+test1@gmail.com`).

### Money and live mode
5. **Never switch to live mode** (`DEMO_MODE=false`, `--live`) or set POK to `production` without the owner's explicit OK.
6. **Never trigger anything that costs money:** real AI generations, paid plan upgrades, purchases, extra paid services.

### Secrets
7. **Never show secrets in the chat or in commits:** no printing `.env.cloudflare`, `.env`, passwords, API keys or tokens. Ask the owner to type keys into Admin → Connections or their own terminal, never into the chat.
8. **Never change or regenerate `APP_SECRET`.** It encrypts the saved connections; changing it makes them unreadable.

### Code and Git
9. **No commit or push without asking.** Never commit directly to `main`; work on a branch.
10. **Never force-push** or rewrite Git history.
11. **Keep LAUNCH-CHECKLIST.md up to date** whenever something is built or tested (tick the item, add a change-log row).
