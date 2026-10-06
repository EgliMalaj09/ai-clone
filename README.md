# PROJECT STUDIO

A working template-based video creation MVP. Customers choose an outcome, upload photos, pay the template's fixed price, and receive a video in My Creations. No balance purchase is required.

## Included

18 original templates and playable concept previews; search, categories, sorting and favorites; email/password accounts; secure uploads; orders and checkout; asynchronous multi-step workflows; private video playback, downloads, expiring share links and deletion; protected administration for templates, prices, workflows, users, payments, refunds, provider switches, encrypted connection management, a photo-to-video workflow preset and metrics; operations/readiness dashboard, activity log, paginated administration, password changes, session revocation and account exports.

**Demo mode uses simulated payments and bundled sample videos. It does not transform the uploaded person's identity.** Live payments and generation require your own Stripe and AI service credentials.

## Stack

React 19, TypeScript, Tailwind 4 and Vinext (Next.js-compatible application routes), deployed as a Cloudflare Worker. Drizzle defines the relational schema; D1 supplies persistent SQLite and R2 supplies private object storage. D1/R2 were selected for a complete deployment in Sites. PostgreSQL is not implemented; moving to it requires a database adapter and SQL migration conversion. Storage and AI providers have explicit interfaces.

## Production administration

Open `/login?next=/admin` with your administrator account. Add your own API keys in **Connections**; choose a template under **Templates**, then **AI workflow → Use photo-to-video workflow**. Write your private prompt, set the price and publish. See the [admin guide](docs/ADMIN-GUIDE.md).

`.env.example` defaults to production mode with checkout closed. Configure services, an external dispatcher and publicly reachable service endpoints before accepting purchases. A false demo flag alone does not activate paid services. Local development can still explicitly enable the simulator using the setup script below.

## Local setup

Use Node 22.13+ and pnpm (see packageManager in package.json).

1. `pnpm install --frozen-lockfile`
2. `node scripts/init-demo.mjs` creates local secrets and prints the initial admin login. Existing environment files are not overwritten.
3. `pnpm build`
4. `pnpm db:migrate:local` applies the checked-in migrations to local D1. It never targets the hosted database.
5. `pnpm dev` (set APP_ORIGIN in your local environment to the actual preview origin).

Tables are created by migrations. The first application request seeds the 18 templates and bootstraps the admin only when ADMIN_EMAIL and ADMIN_PASSWORD_HASH are supplied. Passwords are hashed, never stored in plaintext. Local R2 and D1 are persisted by Miniflare under `.wrangler/state`.

## Verification

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, build and all test suites on every push and on pull requests from forks. Test result files are attached to each run.

`pnpm typecheck` checks TypeScript. `pnpm build` builds the production Worker. `pnpm test:integration` runs against that compiled Worker in disposable D1/R2 bindings, applies real migrations, and exercises authentication, ownership, uploads, checkout, payment replay, asynchronous workflows, downloads, admin publishing/pricing, refunds and deletion. It creates its own random credentials and does not contact paid providers. Results are written to `test-results/integration.json`.

`pnpm test:security` runs the regression suite for concurrent password reset, session rotation, request bounds, workflow validation, payment retries, webhook ordering, refunds, operational reporting, and data export. Stripe HTTP responses are intercepted in-process; no financial transaction is executed.

`pnpm test:providers` verifies the Fal and Replicate adapters, private R2 ingestion, multi-step signed inputs, and unsafe-output blocking using local HTTP fixtures.

`pnpm test:credits` checks the credits ledger: welcome credits, admin adjustments, idempotency, simultaneous spending and reconciliation.

`pnpm test:production` checks encrypted credentials, production readiness, the ready-made workflow, and production payment/generation guards using local fixtures.

See [API reference](docs/API.md) for routes, [security review](docs/SECURITY.md) for findings and remaining limits, [operations](docs/OPERATIONS.md) for deployment, Stripe, AI integration and queue scheduling; [architecture](docs/ARCHITECTURE.md) for data, security and extension points.
