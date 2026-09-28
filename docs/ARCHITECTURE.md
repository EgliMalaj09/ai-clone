# Architecture

## Data and boundaries

The schema in db/schema.ts defines users, external account extension points, sessions, authentication tokens, templates and ordered workflows, uploads, generations and execution steps, output assets, favorites, orders, payments, refunds, provider configuration, application settings, events, rate limits and audit logs. Checked-in Drizzle SQL files are the schema history. Demo content is seeded as runtime DML after migration.

Public template responses are explicitly whitelisted: prompts, models, provider settings and internal economics are omitted. Admin authorization is checked on the server for each operation. The immutable generation snapshot protects in-flight purchases from later admin edits. Order idempotency keys, one payment per order, unique generation-step identities and persisted webhook IDs prevent ordinary replay duplication.

## Request flow

Template selection → authenticated upload to R2 → validated checkout with price and workflow snapshot → server-confirmed payment → leased asynchronous steps → private output in R2 → My Creations. Upload ownership and count are rechecked at checkout. Price calculations use server records and integer amounts. Unpaid jobs are never selected by the queue. Deleted creations that settle late are refunded.

## Security and privacy

Passwords use salted PBKDF2; opaque session tokens are hashed in the database. Cookies are HttpOnly, SameSite=Lax and Secure over HTTPS. Authenticated mutations require a trusted Origin or same-origin browser metadata, server schemas validate inputs, database queries bind values, file sizes and magic bytes are checked, and random storage keys conceal filesystem details. JSON and multipart requests are bounded while streaming. Reset tokens are consumed atomically; changing a password rotates the current session and revokes others. Self-service account deletion requires the current password. Uploaded/generated media require ownership, admin permission or a time-limited signature. Admin previews alone may be public. API secrets reside only in environment bindings. Signed URLs are bearer access: anyone given one can view until expiry.

File validation checks supported signatures, not a full antivirus/decompression-bomb inspection. Add a scanning/normalization service for a high-volume public launch. Share links expire; deletion invalidates them by removing the stored object. Active generation deletion is blocked until it finishes. Account deletion removes files, sessions, uploads and the user; anonymized financial records remain.

## Extension points

AIProvider and ObjectStorage separate infrastructure from customer outcomes. Orders/payments/refunds form a monetary ledger foundation; adding a wallet requires separate transactional balance/ledger records. Creator ownership, revenue-sharing ledgers, subscriptions, coupons and regional prices are future extensions, not implemented features. The existing accounts table can host OAuth identities when adding a verified OAuth flow.

## Known MVP limits

No Google OAuth, PostgreSQL adapter, marketplace, wallet, automated tax handling or native mobile application. The queue uses D1 leases rather than a managed message broker; high-volume production should add a broker/consumer while preserving generation identities. Cost and profit metrics are estimates, not reconciled provider invoices. Currency reports remain separated. Public sample videos illustrate outcomes and do not claim to be personalized AI results.

## Reporting and operational APIs

`lib/server/operations.ts` holds role-protected readiness, audit, paginated administration and account security APIs. `catalog-query.ts` provides a safe public catalog query layer with whitelisted sort/filter fields and explicit public record projection. `http.ts` centralizes bounded body parsing and pagination validation. Query values are bound rather than interpolated; interpolated SQL fragments come from closed server-side maps.

Payment retries increment a durable checkout attempt only after Stripe confirms expiry. Queue-to-refund races invalidate lease ownership and prevent finalization. External full refunds create reconciliation records even when initiated outside this app. Processing stores asset IDs in workflow context rather than expiring URLs; only submission-time provider inputs contain signed media URLs.
