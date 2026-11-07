# Archived agent notes

Moved from AGENTS.md to keep automatically loaded instructions concise. The original text below includes superseded behavior, deployment snapshots and task-specific permissions. It is historical reference, not current instructions or authorization. Consult feature docs and verify live state before acting.

---

# AGENTS.md

> Deployed app update (7 November 2026): Production `dpl_EcvLQtav2nqZLGShSgk4GEZbkNtE` is READY. Demo submission/retry logs and removal of timed auto-success are verified through the signed Shopify proxy; Royal Express backend totals are included. All acceptance attempts were cancelled. No theme upload, migration, environment change or Git staging occurred. Required authenticated Vercel MCP, Context7, Vercel deployment/CLI/Functions skills, Node/npm and isolated Playwright setup remain documented below and in the [release record](docs/mock-checkout-deployment.md). No new plugin/dependency is required. This deployment supersedes earlier app source-only statements; frontend deployment remains separate.



## Readable demo runtime logs — 7 November 2026

The companion app emits one best-effort `[COCO DEMO]` info message after a fresh checkout/retry payment attempt commits. Use saved snapshot item titles/quantities, total, method, reference and attempt creation time in Asia/Bangkok; label retries separately. Do not log customer details, capabilities, idempotency keys, gateway credentials/identifiers, QR payloads or payment URLs. Quotes/polls/reloads/duplicate requests remain silent, and log failures cannot block payment initialization. No database/API/configuration/dependency change or deployment is included.

Required tools are existing Node/npm for tests/typecheck/lint, Context7 MCP (`https://mcp.context7.com/mcp`, resolve the official Vercel library first) for documentation, and the Vercel plugin's `vercel:vercel-functions` skill for runtime logging guidance. Vercel dashboard access to the COCO project is needed to view logs after a separately authorized deployment; Vercel MCP/CLI is optional for inspection/deployment. Purposes, dependencies, client configuration, plugin installation, account setup and the nontechnical presentation steps are in [docs/agent-setup.md](docs/agent-setup.md) and [docs/demo-activity-logs.md](docs/demo-activity-logs.md). No new plugin/MCP service is required. Preserve both Git indexes and start no dev server.

> Current local behavior (7 November 2026): simulated payments no longer auto-succeed after 10 seconds. Status and sweep keep them pending until cancellation or expiry. Existing successful records and verified KBZPay UAT evidence handling are unchanged. This source change is not deployed. Existing Node/npm tests and Shopify/Context7/browser tooling remain sufficient; no new plugin, MCP server, skill, configuration or dependency is needed. Setup: [agent tooling guide](docs/agent-setup.md) from the project root.



## Royal Express checkout — 7 November 2026

The current local quote flow accepts a Royal Express `shipping: { state, city }` selection. IDs are exact canonical Burmese names. Server-generated data in `app/lib/royal-express-data.server.ts` comes from `../../coco-original/royal-express.json`; regenerate from the theme with `npm run build:royal-express`, verify with `npm run check:royal-express`, and set `COCO_APP_PATH` for another app checkout location. Do not hand-edit generated rates. New snapshots freeze subtotal, shipping, total and destination; create validates delivery against that destination. Location-free quotes are preview-only. Retry/resume preserve saved historical totals, including snapshots without new metadata. No migration or deployment is included.

Required tooling remains Node/npm and existing TypeScript/Prisma/React Router test/build dependencies; Context7 MCP (`https://mcp.context7.com/mcp`, resolve the official library ID before querying) for documentation; the Shopify plugin's `shopify:shopify` skill and Dev MCP/local CLI Theme Check for theme/API validation; and browser MCP or isolated Playwright 1.58.2/Chromium for theme acceptance. Purposes, installation, client configuration, dependencies and exact commands are in [docs/agent-setup.md](docs/agent-setup.md) and the [theme's Royal Express guide](../../coco-original/docs/royal-express-checkout.md). No new plugin, runtime npm dependency, database operation or payment credential is required. The installed API is 2025-10; the current toolkit no longer carries that schema, so nearest-supported-schema validation is supplemental only.

Run app tests/typecheck/lint/build plus theme consistency, delivery-browser and QR suites. Fixtures start no server and make no live payment calls. Preserve both Git indexes/settings and keep this coordinated source release separate from deployment. For Burmese font updates preserve the theme's bundled OFL license.

## Active simulation rollout — 6 November 2026

The user authorized and completed the Production app + additive migration + unpublished Dev Preview deployment. This supersedes the source-only restriction below for this release. Active app `dpl_2oumvMqVuBWk8ZQRiXvZd311VeLo` is READY in Singapore (`sin1`), using the current staged/working implementation, not an older Git snapshot. Production explicitly has `KBZPAY_MODE=simulation` and `KBZPAY_ACCEPT_NEW_PAYMENTS=true`; no UAT credentials/gateway calls. Prisma applied `20261106000000_kbzpay_uat` once to verified COCO project `jsiqibwdsvvhwhlvhisj`, preserving ownership/RLS. Exactly 33 checkout/locale files were uploaded to unpublished theme `187388330168`; the published theme and both themes' settings are unchanged. Both Git indexes are preserved.

Desktop PWA and mobile MMQR signed-proxy success/reload, QR download decoding, cancellation/retry, ownership and invalid-operation/unsigned-callback rejection passed. The app region was aligned with the Singapore database because Virginia round trips consumed the 10-second simulation window; keep `vercel.json` and Vercel `resourceConfig.functionDefaultRegions` set to `sin1`. Do not send legacy `serverlessFunctionRegion` together with the modern resourceConfig field. Required Vercel deployment/environment/functions, Supabase/Postgres, Shopify/CLI, Context7 and Playwright fallback setup is unchanged and documented in `docs/agent-setup.md`. See `docs/mock-checkout-deployment.md` for fingerprints, targets, acceptance, remaining UAT work and rollback. Commit all implementation/configuration before future Git deployments; this rollout did not commit, push, stage, start a dev server or remove old remote resources.

## Current source: KBZPay simulation and UAT — 6 November 2026

This section supersedes the sample-only lifecycle and older hosted-provider guidance below. The current authorized work is source preparation only: no deployment, migration execution, credential changes, staging, commit/push or dev server. Published-theme settings and historical records are preserved.

- `KBZPAY_MODE` defaults to `simulation`; new payments automatically succeed after 10 seconds when backend status/sweep reconciles them. No fake gateway page or external simulation provider is used. Sample PWA/QR instructions remain non-payable. `uat` selects direct KBZPay; no production mode or fallback.
- The adapter in `app/lib/kbzpay.server.ts` owns signing, precreate, signed PWA links, MMQR, queryorder and confirmed closure. Public JSON `POST /payments/kbzpay/notify` verifies the saved UAT identity/evidence and returns plain `success` after persistence. No Shopify writes, emails or fulfillment.
- Apply additive migration `20261106000000_kbzpay_uat` only during a separately authorized release. It adds merchant/gateway/transaction metadata and permits UAT alongside simulation. Legacy pending attempts without gateway identity retire on resume; historical terminal rows remain unchanged. Preserve saved mode, merchant identity and signing-key fingerprint; do not rotate away a key while its UAT attempts remain unresolved.
- Runtime UAT requires gateway/PWA URLs, app ID, merchant code, app key and public HTTPS callback URL; merchant/MMQR activation, wallets and network/PWA whitelist requirements must be confirmed with KBZPay. See `.env.example`, [docs/mock-checkout.md](docs/mock-checkout.md) and [docs/kbzpay-uat.md](docs/kbzpay-uat.md).
- Tooling is unchanged: Node/npm, Prisma 6, existing node:test/PGlite/JSDOM and theme QR decoding dependencies; Context7 MCP for current Prisma/Liquid documentation; Shopify skill and Shopify Dev MCP or authenticated CLI Theme Check for Liquid; Supabase and Postgres best-practices skills for persistence, Supabase tools only for separately authorized remote work; Vercel tools/skills only for separately authorized hosting work. Browser MCP or temporary Playwright is for authorized preview acceptance. No KBZPay plugin/SDK is needed. Purposes, dependencies, secure setup and validator fallback are in [docs/agent-setup.md](docs/agent-setup.md).
- Validate with `npm ci`, `npx prisma generate`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, plus companion `npm run test:checkout-qr` and Theme Check. Real credentialed UAT/browser acceptance follows an authorized release; local tests do not certify the bank integration.

## Checkout review alignment — 6 November 2026

The user authorized staging the existing sample checkout implementation, simulator-source removals, updated tests, and related documentation to match the companion theme. This supersedes older instructions to leave the index unchanged for this correction only; preserve unrelated staged content. Keep Dev Preview's enabled setting and package versions unchanged. No deployment, migration, remote resource cleanup, commit, push, or dev server is authorized by this correction. Required plugins, MCP servers, skills, dependencies, configuration, and setup remain documented below and in `docs/agent-setup.md`; no new tooling is required. Validate the final staged snapshots together, including the newly tracked sample-instructions module, so working-tree files cannot mask missing staged dependencies.

## Latest authorized deployment — 6 November 2026

Proxy sample responses are deployed to the existing Production Vercel app (`dpl_5in7PbcmySBxuDExqUsxaA1sWE71`) and unpublished Dev Preview `187388330168`. Published theme `179650658488` and both themes' settings are unchanged. Signed-proxy PWA/MMQR, QR download decoding, reload, cancellation/retry and simulation rejection passed. No migrations, environment changes, remote simulator-resource removal, Git push/commit, staging changes or dev server. Existing global GSAP theme errors were reproduced on the published theme and remain outside this release. See the companion `docs/mock-checkout-deployment.md` for source fingerprint, exact targets, tooling, browser limitations and rollback; older source-only/hosted rollout notes below are historical.

Required deployment tools: authenticated Vercel MCP for current-source deployment/status/logs, existing COCO Shopify CLI login for scoped unpublished theme uploads, Context7 MCP plus Vercel/Shopify skills for docs, and temporary Playwright/Chromium for browser acceptance. Their purposes, dependencies and setup remain in `docs/agent-setup.md`. Never deploy an older Git snapshot over the current working implementation.

Preview: https://dut44m-vn.myshopify.com/pages/checkout?preview_theme_id=187388330168&view=checkout&demo=sample

## Current source: proxy sample instructions — 6 November 2026

This section supersedes the simulator/hosted-payment implementation guidance below. Those rollout notes describe historical deployed behavior; this source change is not deployed automatically.

- The signed `POST /apps/proxy/mock-checkout` endpoint supports quote/create/status/retry/cancel. The app generates instructions locally: PWA `https://www.kbzpay.com/en`, MMQR raw `COCO-SAMPLE-MMQR:NOT-PAYABLE:<attempt ID>`. No `qrImage`, hosted gateway, simulated outcomes, callback approval, or external payment provider is used.
- New sample attempts remain pending until cancelled or expired. Keep status polling/reload recovery; never infer success from navigation or query parameters. Retired pending simulator attempts become cancelled on resume (expired if past deadline); historical terminal data remains unchanged.
- The companion theme bundles `qrcode@1.5.4` locally as `assets/checkout-qr.js`; `esbuild@0.25.12` builds it. In `../../coco-original`, run `npm ci`, then `npm run build:checkout-qr`. Commit the generated asset. `npm run test:checkout-qr` uses pinned jsQR 1.4.0/pngjs 5.0.0 to decode its output. All are development dependencies; the browser loads the committed asset with `defer` before checkout JS. Preserve its MIT license header.
- Runtime setup: Shopify auth/database variables, `MOCK_CHECKOUT_ENABLED`, `MOCK_CHECKOUT_SHOP`, optional `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED`; `MOCK_PAYMENT_SWEEP_SECRET` protects optional local expiry scheduling. Hosted/provider/callback configuration is no longer consumed by checkout. No schema migration is needed.
- Required documentation tool: Context7 MCP (`https://mcp.context7.com/mcp`), configured in the agent MCP settings; resolve official library IDs then query current documentation before library/API changes. Shopify plugin/skill plus Shopify Dev MCP or local Shopify CLI Theme Check validates Liquid; install/authenticate Shopify CLI against COCO only. Browser MCP or the documented temporary Playwright/Chromium fallback verifies desktop/mobile behavior. No payment-provider plugin or KBZPay credentials are required.
- Companion persistence work uses the Supabase and Postgres best-practices skills; Supabase MCP/CLI is only needed for remote database/function operations. Vercel MCP/CLI and hosting skills are only needed for a separately authorized deployment. Install/connect those plugins independently, verify the COCO account, and keep credentials in private host stores. Detailed tool dependencies, configuration and setup links remain in `docs/agent-setup.md` and the companion guide.
- Preserve staged changes. Do not start a dev server, run migrations, deploy, change the live theme, or remove deployed simulator resources as part of this source-only change. See `docs/mock-checkout.md` for the current API contract. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` here; set `COCO_THEME_PATH` if the theme is elsewhere. The existing Prisma/React Router stack is unchanged. The protected sweep route now only expires/retires pending attempts locally; it never calls the provider or deletes records. Simulator Edge Function/hosted/callback source is removed; historical migrations/tables are retained.

## Project Context

This repository is the Shopify app companion for the COCO ORIGINAL Shopify theme.

This app is for COCO ORIGINAL, not GG Fest. Do not use GG Fest project context or configuration for this app.

COCO ORIGINAL requires a different Shopify account from GG Fest. Treat Shopify MCP and Shopify plugin logins as separate authentication contexts; do not assume signing in to one signs in to the other. Before accessing store data or making remote changes, verify that the relevant connection targets the COCO ORIGINAL account and store. Do not reuse a GG Fest login for this project. Developer documentation access alone does not confirm an authenticated store connection.

Related theme project:

- `../../coco-original`

The two projects are related but have different responsibilities:

- `../../coco-original` is the Shopify Online Store theme. It owns storefront Liquid, JSON templates, snippets, CSS, and browser JavaScript.
- This project is a Shopify React Router app. It owns server-side app routes, Shopify app authentication, webhooks, and external API calls that require private credentials.
- Storefront UI should generally remain in the theme. Server-only work, secret handling, and external API proxying belong in this app.

## Current App Shape

This app is based on the Shopify React Router app template.

Key paths:

- `app/routes.ts` configures file-system routes with `flatRoutes()`.
- `app/routes/app.tsx` is the embedded Shopify Admin app shell.
- `app/routes/app._index.tsx` is the current admin home/demo route.
- `app/routes/app.additional.tsx` is a template additional admin page.
- `app/routes/apps.proxy.external-api.tsx` implements the signed external API POC loader and its app-host route alias.
- `app/routes/external-api.tsx` re-exports that loader at the configured proxy target.
- `app/routes/external-api-test.tsx` re-exports the signed loader and requires Shopify proxy verification; it is no longer an unauthenticated diagnostic bypass.
- `app/shopify.server.ts` configures Shopify auth/API helpers.
- `app/db.server.ts` configures Prisma.
- `prisma/schema.prisma` defines session storage.
- `shopify.app.toml` contains Shopify app configuration.
- `shopify.web.toml` contains Shopify CLI web process configuration.

Current behavior observed:

- The app is configured as an embedded app named `App Proxy`.
- Admin routes authenticate with `authenticate.admin(request)`.
- The home route still contains Shopify template demo behavior for creating products, metafields, and metaobjects.
- Webhook handlers exist for `app/uninstalled` and `app/scopes_update`.
- Prisma stores Shopify sessions in Supabase PostgreSQL using server-only `DATABASE_URL` and `DIRECT_URL`, inside the private `shopify` schema. The old SQLite schema/migrations are archived under `prisma/sqlite-archive`.
- The proxy POC fetches `EXTERNAL_API_URL` with a five-second timeout and returns selected todo fields. It sends server-only `EXTERNAL_API_SECRET` as `x-api-key` to the fixed HTTPS upstream, with redirects disabled.
- The theme has a proxy test section, but its browser-only custom checkout mock is not connected to this app.

Project setup is documented in `README.md`; current endpoint contracts, limitations, and manual verification scenarios are in `docs/architecture.md`.

## Theme Relationship

The intended relationship is:

1. The COCO ORIGINAL theme renders storefront pages and browser interactions.
2. The theme calls this app only when it needs server-side capabilities.
3. This app calls external APIs using private environment variables.
4. This app returns sanitized responses to the theme.

Typical flow:

```text
Theme GET /apps/proxy -> Shopify app proxy -> App /external-api -> Shopify signature verification -> GET EXTERNAL_API_URL -> Selected JSON fields returned to theme
```

Important:

- `[app_proxy]` is configured with prefix `apps`, subpath `proxy`, and an app-host target ending in `/external-api`.
- `/apps/proxy/external-api` is also an app-host alias for the signed loader; it is not the configured storefront entrypoint. The theme test section displays that misleading path but actually fetches `/apps/proxy`.
- The signed loader verifies requests using `authenticate.public.appProxy(request)` before calling the upstream. Signature verification does not establish customer ownership of checkout resources.
- `/external-api-test` requires the same Shopify authentication as `/external-api`; do not reintroduce an unauthenticated bypass.
- Confirm the installed store's active proxy configuration before assuming storefront routing is live.
- Keep external API secrets in the app host environment, never in theme files or storefront-visible settings.

## Deployment Relationship

The theme and app deploy separately:

- The theme deploys to Shopify Online Store.
- This app deploys to an app host such as Vercel.

`shopify.app.toml` currently points app, callback, and proxy URLs at a Vercel host. These are repository configuration values; deployment health and durable production session storage remain unverified. Shopify CLI app deployment and app-server hosting are separate.

If this app is later moved inside the theme repository, prefer a monorepo-style path such as:

```text
coco-original/
  apps/
    app-proxy/
```

In that layout, configure Vercel's root directory to the app subdirectory (`apps/app-proxy`), not the Shopify theme root.

## External API Role

The main expected purpose for this app is calling external APIs that the theme cannot safely call directly.

Themes can call public external APIs when browser access is permitted. This app is needed for calls requiring private credentials. The POC uses `EXTERNAL_API_URL` and server-only `EXTERNAL_API_SECRET` to call a separate, API-key-protected Supabase Edge Function. The mock function has no database or payment operations. Real payment provider choice and checkout operations remain pending.

Before live integration, define checkout validation and customer authorization, add abuse controls, replace POC diagnostics with safe errors/redacted logs, and establish durable production session storage. The proxy now returns safe authentication/storage errors. The theme test section still logs complete responses; do not extend these diagnostics to real checkout data.

Rules:

- Store API keys and secrets in environment variables.
- Do not expose private credentials to Liquid, JavaScript assets, theme settings, or client responses.
- Return only the data the storefront needs.
- Add timeouts and error handling around external API calls.
- Avoid logging sensitive request headers, tokens, customer data, or payment-like data.

## Mock Checkout Safety

The related theme currently contains a mock checkout prototype.

If this app is ever connected to that flow:

- Do not create real Shopify orders for the mock checkout unless explicitly requested with production requirements.
- Do not call real payment gateways.
- Do not transmit real card data.
- Do not store payment details in Prisma, Shopify metafields, cart attributes, logs, or external APIs.
- Keep mock checkout responses clearly labeled as simulated/demo behavior.

## Useful Commands

- `npm run dev` starts Shopify CLI app development.
- `npm run build` builds the React Router app.
- `npm run typecheck` runs React Router typegen and TypeScript.
- `npm run lint` runs ESLint.
- `npm run setup` runs Prisma generate and deploys migrations.

Do not run the dev server unless explicitly needed. If a server is started, terminate it before finishing.

## Documentation Lookup

- Use Context7 MCP before implementing features with external libraries, frameworks, SDKs, APIs, CLIs, or cloud services.
- For Shopify behavior, prefer official Shopify documentation through Context7 or Shopify Dev MCP.
- For Vercel deployment behavior, check current Vercel documentation before making deployment changes.

## Agent tooling handoff

See [docs/agent-setup.md](docs/agent-setup.md) for required plugins, MCP servers, skills, account targets, dependencies, configuration, and secure setup instructions. Keep this guide current when tooling changes.

## Connected mock checkout (current implementation)

This section supersedes earlier statements that checkout is browser-only/not connected. See [docs/mock-checkout.md](docs/mock-checkout.md) for API contracts, lifecycle, preview isolation, migration, configuration, verification, and rollback. New code remains disabled unless `MOCK_CHECKOUT_ENABLED=true` and the configured COCO shop matches.

- `app/routes/external-api.mock-checkout.tsx`: signed storefront quote/create/status/retry/cancel/simulate endpoint.
- `app/lib/mock-checkout*.server.ts` and `mock-payment-provider.server.ts`: catalog pricing, ownership, transactions, provider requests, evidence validation, and reconciliation.
- `app/routes/webhooks.mock-payments.tsx`: independently HMAC-authenticated mock provider callback.
- `app/routes/internal.mock-payments-sweep.tsx`: bearer-authenticated scheduled reconciliation/cleanup.
- Prisma models/migration hold private mock records; `coco_mock_provider` is a separate private schema for the API-key-authenticated Supabase `mock-payments` function and durable callback outbox.
- Read `../../GG-Payment-Server` for backend patterns and `../../gg-gaming-fest` for UX only. Do not change either reference project or use their secrets/accounts.
- Keep all payment activity simulated; no Shopify writes, real gateway calls, wallet credentials, email, or fulfillment. Never log delivery details, capabilities, raw callbacks, or secrets.
- Required tooling: Shopify skill and developer MCP/Theme Check for theme/API validation; Context7 MCP for current official API/library docs; Supabase skill and Postgres best-practices skill before schema/RLS/Edge Function work; Supabase MCP/CLI for isolated preview configuration; Vercel environment/functions/deployment skills and Vercel MCP/CLI when configuring hosting. Browser MCP is required for mobile/desktop acceptance against preview. Tool purposes, dependencies, account verification, setup URLs, and secret configuration are in [docs/agent-setup.md](docs/agent-setup.md) and the mock checkout runbook.
- Node/npm and existing Prisma/React Router dependencies remain unchanged. Deno/Supabase CLI are required to check/deploy the Edge Function; its Postgres.js and QR dependencies are version-pinned in imports.
- Do not run `vercel-build`, `setup`, migrations, cron installation, or deployment against an unverified/shared database. Production and preview secrets/databases must be separate.


## Current deployed Preview configuration

See [docs/mock-checkout-deployment.md](docs/mock-checkout-deployment.md). On 5 November 2026 the user declined a paid Supabase branch and approved using existing COCO project `jsiqibwdsvvhwhlvhisj`; this overrides the separate-preview-database requirement for this deployment. Preview-only Vercel variables, provider secrets, private tables/roles, and minute cron are configured and verified. Production environment IDs/keys remain unchanged. Storefront session/proxy/Page/template wiring is still pending; do not claim the journey is live or silently enable Production.

Vercel MCP is now available and team-authorized; use it for environment, deployment, and alias operations. Supabase MCP covers SQL/schema/function deployment; its missing secret-management capability was handled through the authenticated Supabase Management API using the existing private CLI token, never printed or committed. Context7/Shopify/Supabase/Vercel skills and setup dependencies remain as documented. Register/verify the Preview OAuth callback before Preview authorization. Preserve staged changes and never expose secret values in documentation.

The provider callback source now uses an eight-second network deadline and `EdgeRuntime.waitUntil` for immediate dispatch, backed by the persisted outbox/cron. This local source fix was deployed directly through Supabase MCP and must be committed before future releases to prevent regression. Runtime app roles remain restricted; privileged migration setup was applied via Supabase admin and marked with Prisma migrate resolve. Do not grant CREATE ROLE or global database CREATE privileges to runtime roles.


## Connected sample catalog and hosted PWA

The user selected the existing app backend for the connected mockup. Production deployment is ready and guest browser journeys are verified; see the deployment runbook for the active deployment and operational details. Keep the published Shopify theme disabled; enable only Dev Preview. Existing approved COCO database sharing remains in effect; no paid branch.

- `quote` supports `source: "sample"` when `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED=true`; it freezes a server-owned fictional jersey at 35,000 MMK, quantity one, independent of Shopify inventory. Normal catalog pricing/authentication is retained.
- `instructions.pwaUrl` is generated by the authenticated provider and points to `/mock-payments/hosted`. The shared token module signs attempt identity/deadline with independent `MOCK_PAYMENT_HOSTED_SECRET`; `MOCK_PAYMENT_HOSTED_ORIGIN` must be the canonical HTTPS backend origin in both runtimes. Return origins are separately allowlisted in app `MOCK_PAYMENT_RETURN_ORIGINS`. No delivery details or broad checkout capability are exposed on hosted pages.
- Hosted GET only reconciles through the authenticated provider; POST requires the configured public Origin or null Origin with browser-controlled same-origin Fetch Metadata, accepts only success/cancel, and returns 303. Terminal states remain idempotent. Tokens cannot operate on expired/superseded/MMQR attempts. Status/callback reconciliation uses the existing evidence transition service. Saved instructions cannot change. Legacy PWA paths remain accepted for saved attempts.
- Required tools, skills, dependencies and MCP setup remain in `docs/agent-setup.md`; no new package dependency or schema migration is required. Deno check the provider together with `_shared/hosted-token.ts` from a standalone directory to avoid resolving the enclosing Node project. Do not run a development server automatically.


## Active connected mock deployment

On 6 November 2026 the user explicitly approved Production at `htetahkars-projects/shopify-app-proxy` and the COCO provider project. Deployment `dpl_Dg4kNWhNDNTq1Yff5sB6UQpNgG7R` is ready, provider version 7 is active, and callbacks/Vault cron target the canonical Production app origin. Shopify has an offline session and the real signed proxy sample quote works. Only unpublished Dev Preview is enabled; the published theme remains disabled. Old backend Preview provider credentials are retired. See `docs/mock-checkout-deployment.md`; its active rollout supersedes earlier Preview-only restrictions for this user-approved setup.

Temporary Playwright 1.58.2/Chromium tooling under `/tmp/coco-browser-verification` verified deployed guest desktop PWA and mobile MMQR, hosted mobile layout, QR download, receipts and reload recovery without starting a dev server. This is the fallback when Chrome/Playwright MCP is disconnected or missing its browser. Its dependency installation/browser cache and commands are in `docs/agent-setup.md`; do not add it as an app runtime dependency. Signed-in customer ownership is covered by automated tests; a real customer-account browser run remains a manual acceptance item.

Hosted status recovery redirects uncertain POST responses to an authenticated GET; it never assumes provider success. Preserve the configured public-origin and null-Origin/same-origin Fetch Metadata checks with no-referrer privacy. Commit the local hotfixes before deploying from Git again; user staging was preserved.
