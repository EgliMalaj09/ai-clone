# Architecture

## Data and boundaries

The schema in db/schema.ts defines users, external account extension points, sessions, authentication tokens, templates (with credit costs) and ordered workflows, customer uploads, studio-owned template preview media, generations and execution steps, output assets, favorites, credit balances, an append-only double-entry credit ledger, credit holds, credit packs and purchases, provider configuration, application settings, events, rate limits and audit logs. Checked-in Drizzle SQL files are the schema history. Demo content is seeded as runtime DML after migration.

Public template responses are explicitly whitelisted: prompts, models, provider settings and internal economics are omitted. Admin authorization is checked on the server for each operation. The immutable generation snapshot protects in-flight purchases from later admin edits. Order idempotency keys, one payment per order, unique generation-step identities and persisted webhook IDs prevent ordinary replay duplication.

## Request flow

Credit pack purchase (signed webhook grants credits once) → template selection → authenticated upload to R2 (requires credits) → validated generation request that reserves the template's credit cost and snapshots its workflow → leased asynchronous steps → private output in R2 → credits charged on delivery, or returned on failure → My Creations. Upload ownership and count are checked when the generation starts. Credit costs come from server records. Jobs without a pending credit hold are never selected by the queue.

## Security and privacy

Passwords use salted PBKDF2; opaque session tokens are hashed in the database. Cookies are HttpOnly, SameSite=Lax and Secure over HTTPS. Authenticated mutations require a trusted Origin or same-origin browser metadata, server schemas validate inputs, database queries bind values, file sizes and magic bytes are checked, and random storage keys conceal filesystem details. JSON and multipart requests are bounded while streaming. Reset tokens are consumed atomically; changing a password rotates the current session and revokes others. Self-service account deletion requires the current password. Uploaded/generated media require ownership, admin permission or a time-limited signature. Admin previews alone may be public. API secrets reside only in environment bindings. Signed URLs are bearer access: anyone given one can view until expiry.

File validation checks supported signatures, not a full antivirus/decompression-bomb inspection. Add a scanning/normalization service for a high-volume public launch. Share links expire; deletion invalidates them by removing the stored object. Active generation deletion is blocked until it finishes. Account deletion removes files, sessions, uploads and the user; anonymized financial records remain.

## Extension points

AIProvider and ObjectStorage separate infrastructure from customer outcomes. Credits are a double-entry ledger (credit_transactions/credit_entries) with a cached balance per user; every change is one atomic, idempotent D1 batch. See [credits architecture](CREDITS-ARCHITECTURE.md). Creator ownership, revenue-sharing ledgers, subscriptions, coupons and regional prices are future extensions, not implemented features. The existing accounts table can host OAuth identities when adding a verified OAuth flow.

## Known MVP limits

No Google OAuth, PostgreSQL adapter, marketplace, wallet, automated tax handling or native mobile application. The queue uses D1 leases rather than a managed message broker; high-volume production should add a broker/consumer while preserving generation identities. Cost and profit metrics are estimates, not reconciled provider invoices. Currency reports remain separated. Public sample videos illustrate outcomes and do not claim to be personalized AI results.

## Reporting and operational APIs

`lib/server/operations.ts` holds role-protected readiness, audit, paginated administration and account security APIs. `catalog-query.ts` provides a safe public catalog query layer with whitelisted sort/filter fields and explicit public record projection. `http.ts` centralizes bounded body parsing and pagination validation. Query values are bound rather than interpolated; interpolated SQL fragments come from closed server-side maps.

Pack checkout retries increment a durable attempt only after Stripe confirms expiry. A reversed pack payment removes its credits through a reversal transaction. The ledger can be reconciled at any time (Operations, Admin → Credit ledger). Processing stores asset IDs in workflow context rather than expiring URLs; only submission-time provider inputs contain signed media URLs.
