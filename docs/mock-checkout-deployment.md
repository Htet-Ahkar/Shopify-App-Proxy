# Demo logs and pending payments deployment — 7 November 2026

The user authorized deploying the companion app. Production deployment `dpl_EcvLQtav2nqZLGShSgk4GEZbkNtE` is **READY**, with canonical URL `https://shopify-app-proxy-htetahkars-projects.vercel.app` and immutable URL `https://shopify-app-proxy-abaf7jvi6-htetahkars-projects.vercel.app`. Verified project `prj_nfPhXdZL2HDDIPRT3ARxMK0SZlJe`, team `team_O0XCmC5sCq40f01K1Syixi6i` (`htetahkars-projects`), React Router, function region `sin1`. Runtime logs report Node.js 26.x selected by the existing broad package engines range; live signed-proxy acceptance passed.

## Source and build

- Deployed 44 current local runtime/configuration files, including the uncommitted demo logger, removal of timed simulated success, and Royal Express data/quote validation. Base Git commit is `55576570b1732d17d1af4f68801c953283bd5edf`; this release is **not** a deployment of that old commit alone.
- Uploaded manifest fingerprint: `716001b0d5c7971edf4e4d8a7c22757d00091876a3502765b2771bb3fbd0ebd3`, SHA256 over sorted filename, NUL, uploaded bytes, NUL. Environment files, credentials, local agent configuration, docs/tests, node_modules and generated build artifacts were excluded.
- Deployment-only `vercel.json` build override: `npx prisma generate && npm run build`. Build events confirm client generation and the React Router build; **no migration ran**. Local `vercel.json`, Vercel project settings and environment values were not changed. Production mode was read and verified as `simulation`.
- Tests: all 78 app tests, typecheck, lint and production build passed before upload.

## Live acceptance

Signed requests through the real Shopify storefront app proxy verified both KBZPay PWA and MMQR demo flows: 35,000 MMK subtotal + 3,000 MMK Royal Express shipping = 38,000 MMK total; duplicate creation reused the saved attempt; both remained pending after more than ten seconds; cancellation and MMQR retry preserved the frozen total. All acceptance attempts were cancelled afterward.

Vercel runtime logs contain exactly three demo entries for acceptance: two **Checkout submitted** entries and one **Payment retry submitted** entry. Reference `COCO-MOCK-1499EAB2` is the KBZPay sample and `COCO-MOCK-61E74AAA` is the MMQR sample/retry. Bangkok timestamps, saved product title/variant, quantity, total and method are readable. The deployment-scoped runtime error/fatal scan was empty after testing. Capabilities, delivery/contact details, payment URLs, QR payloads and secrets are excluded from release evidence and log output.

Open the project's **Logs** tab and search `[COCO DEMO]`; see [demo-activity-logs.md](demo-activity-logs.md). This app-only deployment did **not** upload or enable any Shopify theme. The new checkout design/State-City UI still requires its own Dev Preview upload and storefront acceptance. No real order, fulfillment, UAT transaction, environment change, migration, Git staging/commit/push or dev server was involved.

## Tooling and recovery

Required tools: authenticated Vercel MCP for project/environment-mode read, current-source inline deployment, build/status inspection and runtime logs; Context7 MCP for current official deployment configuration docs; Vercel `deployments-cicd`, `vercel-cli` and Functions skills for release guidance; existing Node/npm for local checks; isolated Playwright 1.58.2/Chromium for real signed-proxy browser requests without a dev server. The Vercel CLI was unavailable, so MCP handled deployment. Setup, purposes, dependencies and account configuration remain in [agent-setup.md](agent-setup.md); no new runtime tooling or provider plugin is required. No Supabase operation was needed.

Previous Production deployment: `dpl_9rQiiRXaguKZE2CkQe9i1W3YhXUy`. A separately authorized rollback must account for that version restoring timed success and omitting Royal Express shipping. Preserve historical data and any pending demo attempts. Both Git index fingerprints matched before/after release: theme `77179c1aa988f2d1f22e02b3dbab5e18bbbe16b6c6e550e35cb715e05d89e217`, app `66da4aa6283aa2fe57f61349033af1fade84d8ef540d55f4879a3d7797b4e934`.

Temporary local evidence: `/tmp/coco-demo-deployment-manifest.json`, `/tmp/coco-demo-deploy-evidence.json` and `/tmp/coco-demo-deploy-verify.log`. Do not commit source-upload payloads or browser state wholesale.

---

## Active KBZPay simulation deployment — 6 November 2026

The user authorized the simulation-first app deployment, additive database migration and unpublished Dev Preview upload. This active release supersedes the source-only note and older deployment targets below. UAT is implemented but remains inactive; no bank credentials or real gateway calls were used.

- Production app: `dpl_2oumvMqVuBWk8ZQRiXvZd311VeLo`, READY, immutable host `shopify-app-proxy-8ql9i3mle-htetahkars-projects.vercel.app`; canonical host remains `https://shopify-app-proxy-htetahkars-projects.vercel.app`.
- Source: 41 current local runtime/configuration files, including staged/uncommitted implementation, not an old Git snapshot. Deployment manifest fingerprint: `256c4d0193cf490eb72ce6cd81267781236d67ea83acf60a033c15ce240ac8a0` (SHA256 over sorted filename, NUL, file bytes, NUL). Documentation/test files, environment files and local MCP credentials were excluded from upload. Preserve and commit all implementation plus the region configuration before a future Git deployment.
- Database: verified COCO project `jsiqibwdsvvhwhlvhisj`; Prisma applied `20261106000000_kbzpay_uat` once during the first build, with `applied_steps_count=1`. Three nullable metadata columns and the UAT-compatible constraints are present. Table owner remains `coco_app`, RLS remains enabled, and anon cannot SELECT attempts. No broader database/role privilege was granted.
- Configuration: added only Production `KBZPAY_MODE=simulation` and `KBZPAY_ACCEPT_NEW_PAYMENTS=true`. Existing environment entry IDs/targets, Shopify auth/session, database credentials, sweep secret and unused historical provider configuration were preserved. No UAT credentials were configured.
- Region: app functions now execute in Singapore (`sin1`) alongside the Supabase database. `vercel.json` records `regions: ["sin1"]`; Vercel project `resourceConfig.functionDefaultRegions` is also `["sin1"]`. Public response header verified `x-vercel-id: sin1::sin1::…`. The initial Virginia deployment consumed too much of the 10-second simulation window during create/status requests; the Singapore build passed the time-sensitive QR-download journey. The simulation delay was not changed.
- Theme: uploaded exactly 33 checkout/locale files to unpublished Dev Preview `187388330168`. Readback matches local contents (semantic JSON equality for locales). Published theme `179650658488` and both themes' settings are unchanged; saved before/after settings match byte-for-byte. Git index fingerprints for both repositories match the pre-release fingerprints; no staging, commit or push was performed.
- Preview: https://dut44m-vn.myshopify.com/pages/checkout?preview_theme_id=187388330168&view=checkout&demo=sample

Acceptance passed against the actual signed Shopify proxy: desktop PWA placeholder handoff, backend automatic success and receipt reload; mobile MMQR rendered/downloaded PNG decoding, no horizontal overflow, automatic success and receipt reload; cancellation/retry/cancellation with the original deadline; wrong capability rejected with 404; removed simulate operation rejected with 400; unsigned direct proxy rejected with 400; forged callback for a simulation attempt rejected with 401. An abandoned browser attempt was confirmed by the existing minute scheduler with exactly one success event, without any browser status request. A fresh published-theme context returned 200, omitted/disabled checkout, and sent zero checkout requests. Checkout scripts raised no browser errors. Existing global theme errors remain outside this release. Local app tests, typecheck, lint and build also passed before rollout. No Shopify orders, cart changes, real payments, emails or fulfillment were created. Disposable demo payment history is retained.

Tooling: authenticated Vercel MCP for identity, Production environment changes, current-source inline deployment, project function region, build/status and runtime error counts; Supabase MCP for verified project/schema/migration/scheduler inspection; Context7 for current Vercel/Prisma/Shopify CLI docs; existing COCO Shopify CLI login for scoped unpublished uploads/readback. Playwright MCP could not find system Chrome, so the documented pinned Playwright 1.58.2/Chromium fallback under `/tmp/coco-browser-verification` ran acceptance without a dev server. Vercel deployment/environment/functions, Shopify, Supabase and Postgres best-practices skills were used. Setup remains in `agent-setup.md`; no new runtime tooling/dependency is needed.

Local release evidence is under `/tmp/coco-kbz-release`: manifest/fingerprint, before/after theme files/settings, browser result IDs, decoded QR download, screenshots and index fingerprints. These temporary files are not a replacement for this runbook and should not be committed wholesale. No capabilities, private credentials or signed payment URLs are included in this guide.

Rollback: first set `KBZPAY_ACCEPT_NEW_PAYMENTS=false` and stop new preview journeys while keeping the backend enabled for status/callback/sweep recovery. Drain unresolved attempts before returning to old sample-only code, which would retire new pending attempts. Keep the additive migration/history and existing credentials; restore only the backed-up 33 Dev Preview files if needed. Never publish/change the live theme or remove historical simulator resources as part of rollback. UAT activation follows `kbzpay-uat.md` and requires merchant onboarding/credentials plus real wallet acceptance.

> Source-only update, 6 November 2026: the KBZPay simulation/UAT implementation and additive migration are prepared locally. No migration, configuration or deployment was performed for this update. The deployed sample-only version described below remains unchanged. Follow [kbzpay-uat.md](kbzpay-uat.md) for a future authorized activation.

# COCO connected mock checkout deployment

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

## Active rollout — 6 November 2026

The user explicitly approved the exact Production Vercel/Supabase destinations. The connected mock checkout is now deployed and its guest storefront journeys passed. This section supersedes the historical Preview rollout and approval blockers below.

- Active app: https://shopify-app-proxy-htetahkars-projects.vercel.app
- Ready Production deployment: `dpl_Dg4kNWhNDNTq1Yff5sB6UQpNgG7R`, immutable host `shopify-app-proxy-p3ebmd5ie-htetahkars-projects.vercel.app`.
- Source: reviewed local working tree, not an older Git commit. Snapshot SHA256 before the subsequent documentation updates: `c41176cd11d90f85e77a126386097460d3df1eb432b2f08e66cc72214de2b6e3`. Commit all local implementation/fix changes before future Git deployments to prevent regression; staged changes were preserved.
- Provider: COCO Supabase project `jsiqibwdsvvhwhlvhisj`, `mock-payments` version 7, hash `4cab34dfbe2ac8bd223840cefa90fe6d1a0e5e43657327e6d1295a56f6c0c993`.
- Production has ten mock configuration variables: enabled/shop/sample-catalog flags, provider URL/key, callback secret, sweep secret, hosted secret/origin, and return-origin allowlist. Existing Shopify identity, scope, database and POC variables were preserved. Secrets are stored only in Vercel, Supabase Function secrets and Vault.
- Provider callbacks and Vault reconciliation URL now target Production. Minute cron remained active and returned 200. Old dedicated backend Preview credentials no longer match the rotated provider key; that backend Preview is retired for payment testing. The unpublished theme uses Shopify's existing Production app proxy.
- The installed App Proxy was opened and Shopify saved a valid offline session. Real forwarding through `/apps/proxy/mock-checkout` returned a server-owned 35,000 MMK sample quote. No fabricated session or authentication bypass was used.
- Checkout assets/configuration were uploaded only to unpublished Dev Preview `187388330168`. Published theme `179650658488` was not changed. Global Page template assignment remains unchanged; feature-enabled cart/drawer links explicitly use `?view=checkout`.
- Try the connected sample: https://dut44m-vn.myshopify.com/pages/checkout?preview_theme_id=187388330168&view=checkout&demo=sample

Browser evidence: guest desktop PWA completed signed proxy quote/create, navigation to the provider-issued hosted URL, server confirmation, return to COCO, receipt and receipt reload. Guest mobile MMQR completed quote/create, provider-generated PNG display, payment reload recovery, branded QR download, backend demo approval, receipt and receipt reload. Hosted PWA was additionally checked at mobile viewport; no horizontal overflow or delivery information appeared on the hosted page. Delayed MMQR was recovered by cron and its signed outbox callback was delivered without browser polling. Disposable test payments and their provider/outbox records were removed by exact fixture identities. No real payment, Shopify order, stock, cart mutation, email or fulfillment occurred.

Live browser testing found that `Referrer-Policy: no-referrer` makes form Origin null. Hosted POST now accepts either the exact configured public HTTPS Origin or null only with browser-controlled `Sec-Fetch-Site: same-origin`; cross-site requests remain rejected. The configured public origin also determines redirect destinations behind Vercel. Transient Prisma errors observed after approval are handled by a 303 to an authenticated GET status reconciliation, rather than declaring success or falsely showing failure. The redacted diagnostic records only the error class. Do not remove token/evidence validation or treat return parameters as confirmation.

Rollback: disable the feature on Dev Preview first; do not modify the published theme. A coordinated backend/provider rollback must preserve matching credentials, valid frozen instructions, callback destination and Vault sweep configuration. The existing COCO database remains the explicitly approved shared database; no paid branch, additional database or schema migration was created.

## Historical deployment records


## Current state

The backend Preview is deployed and verified. No paid Supabase branch was created. The user explicitly declined its quoted $0.01344/hour cost and approved using the existing COCO database instead. This overrides the earlier separate-preview-database requirement for this setup; app and mock records share the existing project, with separate private provider tables and restricted roles.

- Vercel project: `htetahkars-projects/shopify-app-proxy` (`prj_nfPhXdZL2HDDIPRT3ARxMK0SZlJe`).
- Preview: https://shopify-app-proxy-coco-mock-preview-htetahkars-projects.vercel.app
- Ready Preview deployment: `dpl_Ux1rqYeoiZFpytQJT4RSJhG8tTnr`, app commit `a9f5dfa06280290da09e8a02199dcbeb69166c83`.
- Supabase project: `jsiqibwdsvvhwhlvhisj`, COCO ORIGINAL, organization `hxmilvmgqyhdqbsfejmz`.
- Mock provider: `https://jsiqibwdsvvhwhlvhisj.supabase.co/functions/v1/mock-payments`, deployed version 5. Its callback delivery fix is present in the local function source and was deployed directly with MCP; commit that source change before later releases to avoid reverting it.
- Production Vercel environment IDs/keys were compared before and after: unchanged. No Production deployment was promoted, and no published theme or Shopify page setting was changed.

## Configuration applied

Twelve Preview-only variables were added: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`, `DATABASE_URL`, `DIRECT_URL`, `MOCK_CHECKOUT_ENABLED`, `MOCK_CHECKOUT_SHOP`, `MOCK_PAYMENT_PROVIDER_URL`, `MOCK_PAYMENT_PROVIDER_KEY`, `MOCK_PAYMENT_CALLBACK_SECRET`, and `MOCK_PAYMENT_SWEEP_SECRET`. The app URL is the dedicated Preview alias above; checkout is enabled only in this backend Preview environment. Existing Production variables and existing POC variables were preserved.

Four Edge Function secrets are configured: `MOCK_PROVIDER_DATABASE_URL`, `MOCK_PAYMENT_PROVIDER_KEY`, `MOCK_PAYMENT_CALLBACK_SECRET`, and `MOCK_PAYMENT_CALLBACK_URL`. The callback points to Preview `/webhooks/mock-payments`. Values are not documented or committed.

Private app tables in `shopify` remain owned by `coco_app`. Provider tables are in `coco_mock_provider`, with RLS policies for the non-login `coco_mock_provider_runtime` service role. Login `coco_mock_provider_login` inherits only that provider role. Login `coco_mock_preview_app` inherits the existing `coco_app` role for the Preview connection. No global schema/role creation privileges were granted to the runtime app.

The initial auto-deployment failed because `coco_app` cannot create a database schema. The exact mock migration was completed through the Supabase admin connection, preserving app-table ownership. Prisma's supported `migrate resolve --applied 20261105000000_mock_checkout` repaired its failed migration history. A temporary migration-history-only login was removed afterward. Future fresh environments require the same privileged setup or an appropriate migration administrator; do not broaden runtime privileges.

Supabase `pg_cron` and `pg_net` are installed; Vault was already present. Vault entries `coco_mock_sweep_url` and `coco_mock_sweep_secret` configure the active minute job `coco-mock-payment-reconciliation`. Its URL points to Preview `/internal/mock-payments-sweep`. Scheduler HTTP responses were verified as 200.

## Runtime verification

- Missing/wrong provider keys: 401; valid key plus unknown attempt: 404, proving restricted provider database access works.
- Unsigned app callback and unauthenticated sweep: 401; authenticated Preview sweep: 200.
- Both KBZPay PWA and MMQR initialization returned valid mock instructions; MMQR returned a non-payable PNG QR.
- App reconciliation restored saved initialization records.
- KBZPay immediate simulated approval and MMQR delayed approval reached succeeded checkout/payment states; the scheduled job resolved the delayed result without browser polling.
- Signed callbacks returned 200. Both durable outbox records were verified delivered.
- A real callback took 3.41 seconds, exceeding the original 1.5-second timeout. The deployed fix allows eight seconds and uses `EdgeRuntime.waitUntil` for immediate background dispatch, while persisted outbox leases/retries and cron remain the durable recovery path. Provider responses no longer wait for callback delivery.
- All 44 local tests and ESLint passed after this fix; Deno checked the function successfully.
- Disposable mock quote/checkout/attempt/provider/outbox records were removed after verification. No real payment, Shopify order/draft order, inventory change, or fulfillment was created.

Security advisors report only the expected informational `RLS Enabled No Policy` entries for the private owner-only app/session tables. Their public grants are revoked and their schemas remain private; do not add public policies to silence this informational check. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Remaining storefront connection

The backend Preview is not a completed storefront rollout:

- No Shopify session currently exists in `shopify.Session`; the intended app must be opened/authorized before catalog quoting works.
- The tracked Shopify app/proxy configuration still targets the existing Production host. Connecting the storefront to the new backend requires an explicitly approved Production-backend update or a separately configured Preview app/proxy. Do not silently repoint the shared app proxy or promote Preview.
- The existing published Shopify Page `gid://shopify/Page/164551459000`, handle `checkout`, reports template suffix `Default page`; it has not been changed to `checkout`.
- Theme changes remain staged locally. They were not uploaded or enabled on any theme during this environment-setup task. Keep the published theme's mock setting disabled.
- Register the Preview OAuth callback if using Preview authorization, complete page/template/proxy wiring, and run mobile/desktop storefront acceptance before enabling Dev Preview.

Automatic approval review rejected Production environment changes as outside the approved Preview rollout. It also rejected an ambiguous deployment request. The documented Vercel API creates Preview when target is omitted; deploying a pinned commit without production-branch context produced `target: null`, which was verified as Preview. No Production promotion was performed.


## Connected sample / hosted PWA rollout — 6 November 2026

The user selected and requested implementation against the existing app backend. Source now adds backend-owned sample quotes and provider-issued hosted PWA URLs. There were zero active app/provider attempts and zero Shopify sessions at the pre-rollout check. The published theme (179650658488) was downloaded read-only and its mock checkout flag is false. Dev Preview is unpublished theme 187388330168. Page template assignment remains unchanged; preview the checkout with `view=checkout`, adding `demo=sample` on a public preview hostname.

Automatic approval review rejected the proposed Vercel upsert into Production/Preview because it requires explicit authorization for Production environment changes. That call did not apply the new values. No new app deployment, provider deployment, callback switch, cron switch or theme upload has been performed for this revision. The previously documented provider v5 and ready Preview deployment remain the deployed versions. Do not represent the connected sample journey as live.

Pending authorized rollout: set the new sample/hosted variables plus existing mock provider/callback/sweep variables on Production; stage/deploy the reviewed local app source rather than the older Git commit; configure matching private provider API key, callback secret, hosted secret/origin and Production callback destination; update Vault sweep URL/secret to Production. Recheck active attempts before switching shared provider configuration, draining any that appear. Existing Production Shopify identity and database variables must remain unchanged. Verify callback/status/evidence and cron, authorize the intended Shopify app to populate its offline session, then enable/upload only Dev Preview. Keep the live theme disabled. Never paste or log credential values. No paid branch or new database migration is needed.

Required app environment names: `MOCK_CHECKOUT_ENABLED`, `MOCK_CHECKOUT_SHOP`, `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED`, `MOCK_PAYMENT_PROVIDER_URL`, `MOCK_PAYMENT_PROVIDER_KEY`, `MOCK_PAYMENT_CALLBACK_SECRET`, `MOCK_PAYMENT_SWEEP_SECRET`, `MOCK_PAYMENT_HOSTED_SECRET`, `MOCK_PAYMENT_HOSTED_ORIGIN`, `MOCK_PAYMENT_RETURN_ORIGINS`. Supabase retains `MOCK_PROVIDER_DATABASE_URL` and receives matching provider key/callback secret plus hosted secret/origin and `MOCK_PAYMENT_CALLBACK_URL`. Allowed return origins must enumerate the COCO storefront and the development loopback origins actually used. Rotate secrets through the platforms; never commit private deployment files.
