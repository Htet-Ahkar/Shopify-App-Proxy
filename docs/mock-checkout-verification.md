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
