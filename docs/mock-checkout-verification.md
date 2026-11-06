## Staged review correction — 6 November 2026

The user authorized aligning the staged backend with the existing sample-only theme implementation. The sample-instructions module is now included; hosted simulator/token/provider/callback source and obsolete configuration are removed from the staged release. New attempts stay pending until cancelled or expired. Existing historical records and migrations are retained. Dev Preview's enabled setting and both package manifests/lockfiles were left unchanged by this correction.

- Full app tests passed against the current theme, then passed again from fresh exports of both Git indexes using `COCO_THEME_PATH` to select the staged theme. No tests relied on the original working-tree source.
- Theme QR decoding passed in both the working tree and staged export; staged checkout JavaScript passed syntax checking. Staged runtime imports contain no references to removed simulator modules, and retired hosted/callback routes are absent.
- App typecheck, ESLint, and production build passed. These commands generated only ignored caches/build artifacts; no dev server or database migration ran.
- Local Chromium with intercepted synthetic responses passed exact PWA navigation/Back, pending recovery, mobile QR generation and branded-download decoding, reload, and cancellation. No live storefront, app, or KBZPay requests were needed; the browser closed after verification. Service/DOM tests also cover ownership, idempotency, cancellation/retry deadlines, expiry, simulation rejection, unsafe PWA URLs, QR failure recovery, and stale QR results.
- This correction updated only related staged checkout files and handoff documentation. No deployment, published-theme change, remote resource cleanup, commit, or push occurred. Existing tool setup is in `AGENTS.md` and `docs/agent-setup.md`; no new plugin or MCP server is required.

## Deployed proxy sample responses — 6 November 2026

This rollout supersedes the hosted-simulator deployment notes below. The user explicitly requested deployment of the completed implementation.

- Production backend: `dpl_5in7PbcmySBxuDExqUsxaA1sWE71`, READY at https://shopify-app-proxy-htetahkars-projects.vercel.app; immutable URL https://shopify-app-proxy-8j25k71o0-htetahkars-projects.vercel.app. Target: existing COCO project `prj_nfPhXdZL2HDDIPRT3ARxMK0SZlJe`, team `team_O0XCmC5sCq40f01K1Syixi6i`.
- Deployed the current local working files, including unstaged removals and the new sample-instructions module, through authenticated Vercel MCP. Source payload SHA256: `da3cdffa2f10e917348882b20c821fabb0603da31784f38778fc01b9344e84bc`. No Git push/commit or staging changes were made. Commit this source before future Git deployments to avoid reverting the release.
- Deployment-only build override: `npx prisma generate && npm run build`, install `npm ci`, Node 22 / React Router. No migrations, environment-variable changes, new database resources, provider deployment, or remote simulator-resource removal were performed.
- Shopify CLI uploaded nine checkout assets/snippets/sections/template/locale files to unpublished Dev Preview `187388330168` with `--nodelete` and explicit `--only` paths. Settings were excluded. Before/after settings downloads matched byte-for-byte for Dev Preview and published theme `179650658488`; the published checkout flag remains absent/default false, and Dev Preview remains enabled. No Page assignment or theme publication changed.
- Verified through real Shopify-signed proxy calls: PWA returns exactly `https://www.kbzpay.com/en`; MMQR returns raw non-payable sample text, never `qrImage`. New attempts remain pending. Desktop PWA navigation/Back/reload, mobile QR generation/download decoding/reload/retry, cancellation, and rejection of `simulate` all passed. Hosted/callback routes return 404 and direct unsigned proxy requests remain rejected. The external KBZPay destination was intercepted during browser verification; no payment was initiated. Test checkouts were cancelled and their history retained.
- Browser verification observed existing global `gsap is not defined` errors, also reproduced read-only on the published theme. An unlocated `Unexpected token '<'` event was observed during the PWA journey. Checkout behavior checks passed; this is not a claim that the whole theme is free of JavaScript errors.
- Existing Supabase simulator/function/secrets/Vault/cron remain deployed; the new app never calls that simulator. The retained protected sweep endpoint performs local expiry only. Remote resource retirement is separate work.
- Required tooling remains authenticated Vercel MCP (source deployment/status/build logs), Shopify CLI with the COCO store login (theme list/pull/push), Context7 MCP and Vercel/Shopify skills (current deployment/CLI docs), and the documented temporary Playwright 1.58.2/Chromium fallback (browser acceptance). Setup/dependencies/account checks remain in `docs/agent-setup.md`. No dev server was started.

Preview: https://dut44m-vn.myshopify.com/pages/checkout?preview_theme_id=187388330168&view=checkout&demo=sample

Rollback: disable checkout on Dev Preview first. For a backend rollback, use prior deployment `dpl_Dg4kNWhNDNTq1Yff5sB6UQpNgG7R` only with its compatible hosted-simulator theme and existing matching provider configuration. Do not roll back only one side. Temporary pre-upload files are under `/tmp/coco-sample-release/preview-before`; this is a session-local backup, not a durable artifact. Never publish the checkout demo to the live theme as part of rollback.

## Proxy sample response verification — 6 November 2026

- Full backend `npm test` passed: proxy authentication/POC, sample checkout lifecycle, DOM journeys and PostgreSQL migration/privilege checks.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed in an isolated source copy using the installed backend dependencies; no migrations or development server ran. The same source was then applied to this repository and the full tests passed here.
- Theme `npm run test:checkout-qr` decoded the shipped browser bundle's PNG to the exact raw sample payload at 420px.
- Headless Chromium with intercepted synthetic HTTP responses passed desktop PWA navigation to exactly `https://www.kbzpay.com/en` without added parameters, browser Back/pending recovery, mobile QR rendering, QR/card download decoding, reload recovery, and cancellation. Browser contexts closed after checks. No live app, Shopify or KBZPay requests were made by this fixture.
- Shopify Theme Check reported no diagnostics in the modified checkout Liquid/JS/CSS/generated QR asset or English locale. The full theme still reports unrelated missing translation/assets/image/template diagnostics. The skill-bundled validator lacked `@shopify/theme-check-common`, so the installed Shopify CLI was used instead.
- Both git indexes were preserved. No deployment, live theme edit, secret/cron change, or remote resource/data deletion was performed.

> Source update, 6 November 2026: the local implementation now uses proxy sample instructions and has removed hosted/provider approval code. The deployment and simulator evidence below is historical. No remote deployment, secret/cron changes, data deletion, or theme publication was performed for this change. See `mock-checkout.md` for the current contract.

# Local verification — 5 November 2026

The source implements connected mock checkout in the COCO theme and its companion Proxy app. It remains disabled by default and is not deployed by this change.

## Passed

- App Prisma client generation and schema validation.
- App TypeScript checking, ESLint, and production React Router/Vite build.
- Existing authentication/secret-boundary tests plus new service lifecycle tests.
- Embedded PostgreSQL 17 migration execution, unique pending-attempt/sequence/event constraints, anonymous/authenticated access rejection, provider-role RLS/privilege isolation, and cascade cleanup.
- jsdom journeys for KBZPay PWA and MMQR; required fields, empty/disabled checkout, failure/retry/expiry, interrupted creation recovery, reload with the original attempt/deadline, background polling, terminal polling stop, and branded QR download.
- Deno 2.5.6 check of the actual mock-payments function with its pinned npm imports.
- Shopify skill validator / Theme Check 3.31.0 on all ten changed/new theme code/configuration files. Existing non-blocking markup/complexity/font warnings were compared with the original theme. Two existing cart image-dimension errors were fixed in the touched files.
- JavaScript syntax check, Tailwind 4.1.17 generation, and whitespace checks.

Test-only dependencies are pinned: PGlite 0.3.14 and jsdom 26.1.0. Run `npm ci`, `npx prisma generate`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` in this app. Theme DOM tests use the documented sibling checkout; set `COCO_THEME_PATH` if using another layout. They explicitly skip if the theme is absent. These checks do not run migrations against configured Supabase or start a development server.

## Still required before enabling preview

- Isolated preview Supabase/database and restricted provider login; migration application on that target.
- Dedicated app/provider secrets, stable callback URL, deployed Edge Function and app, Vault/cron setup.
- Shopify app installation/offline session, active proxy mapping, and checkout Page/template assignment.
- Real browser layout/accessibility checks at mobile and desktop sizes and the deployed guest/signed-in acceptance matrix, including closed-tab delayed callbacks and lost-callback recovery.
- Real preview PostgreSQL concurrent requests; embedded PostgreSQL validates SQL constraints, while the service concurrency fixture serializes transactions and cannot simulate networked database contention.

Chrome DevTools/Playwright browser MCP was unavailable in this session, so visual/deployed browser acceptance is not claimed. No remote migrations, deployments, cron jobs, theme setting changes, Shopify orders, real gateway calls, email, or fulfillment were performed.

## Remote backend verification completed

See [deployment record](mock-checkout-deployment.md) for the now-deployed Preview, user-approved shared database, repaired migration, provider/cron secrets, successful PWA/MMQR mock callbacks and delayed reconciliation, disposable-record cleanup, and remaining Shopify/browser acceptance. Production rollout remains unapproved.


## Connected sample and hosted PWA checks — 6 November 2026

53 automated tests passed: 29 checkout/domain/security tests, 11 DOM journeys, 6 app proxy authentication tests, 6 existing upstream POC tests, and one embedded PostgreSQL migration/RLS test. New cases cover server-owned sample prices without catalog access, the sample feature gate, immutable saved instructions, token tampering/attempt/deadline binding, return URL rejection, hosted same-origin POST/idempotent terminal actions, expired/superseded/MMQR token rejection, connected sample reload recovery, and API-loading failure with retry and no frontend fallback. Type checking, ESLint, production build, Prisma schema validation, and standalone Deno provider checking passed. Theme Liquid validation passed using cached Shopify documentation because the schema refresh DNS lookup failed. Tailwind 4.1.17 generation produced identical output. No new migration was required; the existing embedded migration/RLS verification passed. No development server was started.

Remote preflight confirmed zero installed-app sessions and zero active app/provider attempts. The published theme flag was verified false via read-only theme pull. Automatic approval review blocked Production environment changes; therefore real browser/Shopify proxy acceptance, hosted payment redirects/callbacks on the new deployment, production cron verification, and Dev Preview rollout remain pending. Unit/DOM tests are not evidence those remote steps passed.


## Deployed acceptance — 6 November 2026

Production app deployment `dpl_Dg4kNWhNDNTq1Yff5sB6UQpNgG7R`, provider v7, installed offline session, signed Shopify proxy sample quote, authenticated sweep, active minute cron and signed callbacks were verified. Wrong provider key and unsigned callback/sweep returned 401; authenticated sweep returned 200 and authenticated unknown provider attempt returned 404. Delayed MMQR completed through cron/callback without browser polling.

Isolated Playwright 1.58.2/Chromium verified guest desktop PWA from Dev Preview through the external hosted page and back to a backend-confirmed receipt, then receipt reload. Guest mobile MMQR verified provider-generated PNG, pending-payment reload recovery, branded PNG download, backend simulation, receipt and receipt reload. Hosted PWA mobile confirmation/layout/privacy also passed after the no-referrer Origin and uncertain-response recovery fixes. Signed-in customer ownership remains covered by the service/security suite; a live customer-account browser login was not exercised. Do not report that manual case as passed.

The 29 checkout/security regression tests, type check, lint and build passed after the hosted fixes. The complete suite previously passed 53 tests. Liquid validation passed with the pre-existing nonblocking cart branch warning. Tailwind generation was unchanged. The live browser tests used only fictional details and mock records. Cleanup targeted exact known test IDs, never unrelated records or Shopify sessions. No development server was started.
