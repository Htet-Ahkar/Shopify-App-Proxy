# Connected mock checkout

## Status and boundaries

Source implementation for the COCO theme and this app. Preview deployment, database migration, Edge Function deployment, cron installation, and real-store browser acceptance must be completed before enabling the theme setting. No production payment provider is called. No Shopify order/draft order, inventory mutation, email, or fulfillment is created. The Shopify cart remains intact.

References are read-only: `../../GG-Payment-Server` (atomic payment claims, saved evidence, callback verification, reconciliation) and `../../gg-gaming-fest` (checkout, PWA handoff, MMQR card/download). COCO does not connect to their services or copy their credentials, infrastructure, Shopify metafields, or ticket/email workflows. GG uses a 120-minute gateway deadline; COCO uses a 15-minute simulation deadline.

## Configuration and isolation

1. Provision a separate Supabase preview project/database; do not point preview at the existing live session database. Both `DATABASE_URL` and `DIRECT_URL` must target this same preview database with `schema=shopify`. Ensure the private `shopify` schema exists. The existing `Session` migration and the new mock-checkout migration both run there.
2. Populate `.env.example` privately for the app host. Existing Shopify variables must refer to the COCO app/store. Set `MOCK_CHECKOUT_SHOP` to `dut44m-vn.myshopify.com`; `MOCK_CHECKOUT_ENABLED` must explicitly equal `true` to serve new routes. Keep it unset/false on production.
3. Generate three independent secrets: `MOCK_PAYMENT_PROVIDER_KEY`, `MOCK_PAYMENT_CALLBACK_SECRET`, and `MOCK_PAYMENT_SWEEP_SECRET`. Do not reuse Shopify secrets, external-API POC keys, GG keys, or Supabase service-role keys.
4. Review `prisma/migrations/20261105000000_mock_checkout/migration.sql`, then run `npm run setup` with preview-only database URLs. It creates app records in the connection's `shopify` schema and separate `coco_mock_provider` tables. Both schemas must remain outside the Supabase Data API exposed schemas. RLS and explicit revocations prevent anonymous/authenticated access. App runtime uses the existing Prisma database owner; do not use a public database role.
5. Privately create a database login for the Edge Function and grant it membership in `coco_mock_provider_runtime`. That non-login role is provisioned by the migration and has only provider-schema CRUD privileges with matching RLS policies. Use that login's TLS transaction-pooler URL for `MOCK_PROVIDER_DATABASE_URL`. Postgres.js disables prepared statements.
6. Deploy `supabase/functions/mock-payments` to the isolated Supabase project. Copy names from its `.env.example` into the function's private secrets. Supply the matching provider key/callback signing secret, provider database URL, and exact HTTPS app-host `/webhooks/mock-payments` callback URL. `verify_jwt=false` is intentional: the function independently requires its dedicated `x-api-key` on every operation. Existing `mock-external-api` remains unchanged.
7. Set app `MOCK_PAYMENT_PROVIDER_URL` to that function's fixed HTTPS URL. Keep callback and provider URLs stable within the same preview environment. Credentialed requests reject redirects and time out after five seconds.
8. Install/open the COCO app on the intended store to establish its offline catalog-read session. Confirm the active app proxy maps `/apps/proxy` to the app host `/external-api`. Existing product scopes allow catalog reads; do not exercise the template product-creation demo.
9. Enable pg_cron, pg_net, and Vault in preview. Privately provision Vault names `coco_mock_sweep_url` (full HTTPS app `/internal/mock-payments-sweep`) and `coco_mock_sweep_secret` (the matching bearer secret), then install `supabase/mock-payments-cron.sql` once. The minute job dispatches durable callbacks/delayed outcomes, reconciles pending attempts, and removes records older than seven days. Inspect cron/net responses during acceptance.
10. Create a Shopify Page with handle `checkout` and template suffix `checkout` if it does not exist. Upload theme files to the verified unpublished Dev Preview theme only. Enable `mock_checkout_enabled` on that theme after the acceptance checks below; leave the published theme disabled.

Do not run the development server automatically. App and theme releases are separate. Do not use `npm run vercel-build` with an unverified database: that command applies migrations.

## Interfaces

Storefront `POST /apps/proxy/mock-checkout` maps to app-host `POST /external-api/mock-checkout`. Only JSON up to 16 KiB is accepted. Every operation requires Shopify app-proxy authentication, the configured shop, an installed app session, and a 64-character hexadecimal random capability generated in the browser. Only its SHA-256 hash is persisted. Contact/address fields are test data stored in the private checkout snapshot, never in browser storage or logs. Owner-authorized status responses include delivery details to restore the receipt; unauthorised reads return a generic 404.

| Operation | Additional input | Result |
| --- | --- | --- |
| `quote` | `lines: [{variantId, quantity}]` | `quoteId`, five-minute `expiresAt`, authoritative `snapshot` |
| `create` | `quoteId`, UUID `idempotencyKey`, `method`, `delivery` | Checkout status and first attempt |
| `status` | `checkoutId`, or creation/retry `idempotencyKey` for interrupted-request recovery | Latest authorized status; retrieves/reconciles saved payment |
| `retry` | `checkoutId`, new UUID `idempotencyKey`, `method` | New attempt after confirmed failed/cancelled state |
| `cancel` | `checkoutId`, current `attemptId` | Provider-confirmed cancellation or its already-terminal result |
| `simulate` | Same IDs, `outcome` | `succeeded`, `failed`, `cancelled`, `expired`, or `delayed` |

Methods are `kbzpay` and `mmqr`. Delivery requires `name`, `email`, `phone`, `address`, `city`, `country`; `region`, `postalCode`, and `note` are optional. Amounts are exact decimal strings; only MMK is supported. Quotes use active Shopify product variants and base catalog prices, without inventory reservations, production discounts, market pricing, shipping, or tax computation. Browser-submitted prices are ignored. Shipping and tax are visibly simulated zero amounts.

Responses include `mock: true`, reference, checkout/attempt IDs, snapshot, delivery, server time/deadline, status, `canRetry`, and method-specific instructions while eligible. No database row, capability hash, API key, callback secret, or raw provider error is returned. Responses use `Cache-Control: private, no-store` and no permissive CORS.

The capability and opaque checkout/idempotency IDs are held in `sessionStorage`; nothing is stored in `localStorage`. Signed-in checkouts additionally bind to Shopify's verified customer ID. Access expires after 24 hours. Clearing the session capability loses access; the customer may start a new demo. Query parameters control presentation only and cannot mark payment successful.

## Lifecycle

Short serializable Prisma transactions claim checkout/attempt records before network calls; unique quote/idempotency constraints, an attempt sequence, and a partial unique pending-attempt index prevent duplicate initialization and retry races. Identical idempotent requests resume their existing result; changed payloads return 409. Database write conflicts retry up to three times.

Initialization is `initializing`, `ready`, or `reconciliation_required`; payment is independently `pending`, `succeeded`, `failed`, `cancelled`, or `expired`. Provider initialization stores the immutable method, original expiry, amount/currency, environment, and instructions under the attempt ID. The mock provider's primary key makes initialization idempotent. An uncertain provider response stays blocked; status queries recover its persisted record. If the provider explicitly reports no record after fifteen seconds, reconciliation can initialize the same ID with its original expiry. It never creates a replacement attempt on a network error.

PWA instructions lead only to the theme's internal `?step=pwa` demo; no real wallet is opened or credentials requested. MMQR encodes `COCO-MOCK-MMQR:<attempt-id>` and returns a PNG generated server-side by pinned `qrcode@1.5.4`. The downloadable card includes the demo warning, amount, reference, and expiry.

Both authenticated provider status and signed callbacks use one evidence validator and transaction service. Confirmed terminal states cannot regress. `POST /webhooks/mock-payments` requires HMAC-SHA256 over `<13-digit-millisecond-timestamp>.<raw-json-body>`, headers `x-mock-timestamp` and `x-mock-signature`, a dedicated secret, and a five-minute timestamp window. Provider identity, method, environment, amount, currency, and original expiry must match. Event IDs deduplicate callbacks/status evidence. PWA returns, QR scans/downloads, query strings, and browser timers do not establish success.

Delayed success is persisted for thirty seconds later. Status polling can resolve it immediately after it is due; without an open page, minute-based cron typically resolves it in 30–90 seconds. Terminal transitions enqueue callbacks transactionally. Dispatch uses leases, bounded retries (eight attempts), fresh signed transport timestamps, and no secrets in payloads. Status reconciliation recovers even if callback retries exhaust. Network loss at expiry remains pending/reconnecting until authoritative status arrives; payment controls are hidden at the deadline.

Browser polling runs every three seconds while visible, pauses in background, resumes on visibility, and stops on confirmed terminal status. Reload recovers the saved attempt without resetting the deadline. The scheduled sweep bounds its work and advances per-attempt scheduling to avoid repeatedly blocking later attempts. Records are retained seven days; provider and app cleanup are independent.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and Prisma validation. The service tests use a serialized in-memory database fixture and independent fake provider; embedded PostgreSQL (PGlite) separately executes the complete migration and tests constraints, RLS/privileges, and cleanup. jsdom exercises the theme DOM journey and interrupted-request recovery. These do not replace running the integration and race cases against preview Supabase/PostgreSQL or browser rendering checks. Test-only dependencies are pinned in package.json/package-lock.json; set `COCO_THEME_PATH` if the theme is not at the documented sibling path. Edge imports are Deno npm specifiers pinned to `postgres@3.4.7` and `qrcode@1.5.4`; Deno 2.5.6 checked the function successfully. To repeat without resolving the enclosing Node app, copy it to a temporary directory without package.json and run `deno check --node-modules-dir=none --no-lock index.ts` there.

Before enabling preview, verify database constraints/RLS, concurrent create/retry against PostgreSQL, provider missing/wrong-key 401, forged callback rejection, callbacks and callback-loss recovery, delayed outcomes with the tab closed, expiry, retries, page reload/navigation, and QR download. Test guest and signed-in journeys at mobile and desktop widths. Verify private records are unreachable through the Data API and that browser assets/network responses contain no secrets. Confirm cart contents persist and Shopify has no new orders/draft orders or inventory mutations.

## Rollback

Disable the theme setting and app `MOCK_CHECKOUT_ENABLED`; unschedule `coco-mock-payment-reconciliation` if needed. Preserve records for diagnosis. Restore an earlier app deployment only after ensuring its session schema remains compatible; do not drop mock tables to roll back. No live payment integration is included.

Local verification evidence and remaining preview checks: [mock-checkout-verification.md](mock-checkout-verification.md).
