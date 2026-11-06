> Current source update (6 November 2026): checkout now returns local sample instructions. Older provider/hosted setup below is historical and is not required for the new checkout. The backend and unpublished Dev Preview are now deployed; no remote simulator resources were removed. See the deployment runbook for the active release. The optional sweep uses only `MOCK_PAYMENT_SWEEP_SECRET` for local expiry. Keep Shopify/database configuration and checkout flags; provider/callback/hosted variables are unused.
>
> Theme QR setup: in `coco-original`, run `npm ci`, `npm run build:checkout-qr`, and `npm run test:checkout-qr`. The pinned development tools are qrcode 1.5.4, esbuild 0.25.12, jsQR 1.4.0 and pngjs 5.0.0; only the generated local JS asset is shipped. Context7 MCP supplies library docs; Shopify skill/Dev MCP or Theme Check validates Liquid; browser MCP/temporary Playwright checks navigation and QR downloads. Supabase/Postgres skills apply to persistence changes; Supabase/Vercel MCPs and CLIs are needed only for separately authorized remote operations. Setup/account instructions below still apply to those tools. No KBZPay account or payment-provider plugin is needed.

# Agent and developer setup

## Project boundaries and verified targets

This repository is the server app. The storefront theme is `../../coco-original`.
They deploy separately. Never deploy the theme directory as the Vercel app.

| Service | Target | Purpose |
| --- | --- | --- |
| Shopify | COCO ORIGINAL, `dut44m-vn.myshopify.com` / `cocooriginalmm.com` | Signs storefront `/apps/proxy` requests; owns app installation |
| Vercel | `htetahkars-projects/shopify-app-proxy` (`prj_nfPhXdZL2HDDIPRT3ARxMK0SZlJe`) | Hosts React Router server and its private credentials |
| Supabase | COCO ORIGINAL, `jsiqibwdsvvhwhlvhisj`, Singapore | Private `shopify.Session` database and protected mock API Edge Function |
| Supabase organization | Htet-Ahkar' Org (`hxmilvmgqyhdqbsfejmz`) | Owns the dedicated COCO project; do not use Video Education APP |

Verify these targets before reading data, changing secrets, migrating, or deploying.
Connections for other shops/accounts, including GG Fest, must not be reused.

## Plugins, MCP servers, and skills

Plugins and MCP servers are agent tooling, not application runtime dependencies.
The deployed app does not need an MCP server running.

| Tooling | Purpose and setup | Skills |
| --- | --- | --- |
| Context7 MCP (required documentation workflow) | Add `https://mcp.context7.com/mcp` in the client's MCP settings. Configure a Context7 API key through the client's private credential/secret settings, using its documented bearer authentication. Resolve the official library before querying version-relevant docs. [Client setup](https://context7.com/docs/resources/all-clients) | Repository documentation lookup rules |
| Shopify plugin / store MCP | Install through the client's plugin directory, authorize the COCO ORIGINAL Shopify account, then verify shop info before use. Used for store metadata and read-only checks. Store authorization is separate from Shopify CLI and developer-documentation access. | `shopify:shopify`; Liquid guidance for theme work, API/CLI guidance as applicable |
| Shopify developer MCP (optional theme validation) | Connect the official Shopify developer tooling through the client/plugin, follow its current installation guide, and use its API-learning step before its validators. It supplies docs/validation, not merchant authorization. [Official toolkit](https://github.com/Shopify/shopify-ai-toolkit) | Shopify skill validation instructions |
| Supabase plugin / MCP | Install and complete OAuth for the intended account. For a direct MCP setup, use `https://mcp.supabase.com/mcp?project_ref=jsiqibwdsvvhwhlvhisj`; scope it to this project and choose read-only mode for inspection-only sessions. Verify project metadata before writes. [MCP setup](https://supabase.com/docs/guides/getting-started/mcp) | `supabase:supabase`, `supabase:supabase-postgres-best-practices` before schema/SQL work |
| Vercel plugin | Install for Vercel guidance. In the validated session this plugin supplied skills but no callable Vercel MCP tools; CLI authentication was required separately. Verify current availability rather than assuming plugin installation means account access. | `vercel:vercel-cli`, `vercel:env-vars`, `vercel:deployments-cicd`; `vercel:vercel-storage` for database choices |
| Plugin Management (optional discovery) | Use the client's plugin discovery/connection flow to find missing integrations and verify installation. It does not replace each provider's account authorization. | `plugin-management:plugin-management` |

Skill bundles are installed by their plugins. Read their `SKILL.md` instructions
before applying them; do not copy a developer's machine-specific skill paths into
application imports. Keep MCP tokens and client auth configuration outside Git.

## CLI dependencies and authentication

Use the Node version supported by `package.json`; install app dependencies with
`npm ci`. Prisma and its session adapter are managed by `package-lock.json`.
This setup was verified with Prisma 6.19.3 and session adapter 9.0.1.

Vercel CLI was verified at 65.11.0. A global install is optional:

```sh
npx --yes vercel@65.11.0 login
npx --yes vercel@65.11.0 whoami --non-interactive
npx --yes vercel@65.11.0 project inspect shopify-app-proxy --scope htetahkars-projects --non-interactive --json
```

Pass `--project shopify-app-proxy --scope htetahkars-projects` on commands
supporting those flags. Never let an inspection command auto-link another
project. Secrets should be read from protected files/stdin when configured by
CLI, never supplied as literal command arguments or printed.

Shopify CLI authentication is separate from the Shopify MCP connection.
Authenticate to the COCO account deliberately if the CLI reports access denied.
Do not start `shopify app dev` or the theme server unless the user requests it.
App dev can change active tunnel URLs, so verify the target configuration first.

For Supabase Management API/CLI automation, use a scoped personal access token
limited to the intended project/organization and required operations. The setup
used an existing CLI login to read the pooler configuration and configure an
Edge Function secret. Never retrieve or print that login token in chat. Prefer
the connected project-scoped MCP when it supports the task. See [token setup and
permission mapping](https://supabase.com/docs/guides/platform/personal-access-tokens).

## Configuration and deployment

Copy `.env.example` only if `.env` does not exist. Never overwrite an existing
environment file. Configure development and preview environments with a separate
non-production database and their own credentials and API key; production Secrets
are intentionally not copied into the local environment. Both `DATABASE_URL` and
`DIRECT_URL` must target the same isolated database and use `schema=shopify`. The
existing migration explicitly targets the `shopify` schema, so changing only the
URL schema does not isolate it.

Vercel production configuration:

- Existing Shopify `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and scopes.
- `DATABASE_URL`: transaction pooler, `schema=shopify`, server-only.
- `DIRECT_URL`: session pooler for Prisma migrations, server-only.
- `EXTERNAL_API_URL`: protected mock API HTTPS endpoint.
- `EXTERNAL_API_SECRET`: generated mock API key, stored as a Secret.

Supabase Edge Function configuration:

- Source: `supabase/functions/mock-external-api/index.ts`.
- `supabase/config.toml` disables built-in JWT verification only for this
  function because its handler authenticates `x-api-key` itself.
- Set Edge Function secret `MOCK_EXTERNAL_API_SECRET` to the matching generated
  value through secure provider tooling. This is not a Supabase service-role key.

See [database setup](../README.md#supabase-session-storage-deployment) and
[authenticated POC](authenticated-poc.md). Do not expose the private `shopify`
schema through the Supabase Data API.

Before deploying, run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

`vercel.json` uses `npm run vercel-build`, which generates Prisma Client, applies
committed PostgreSQL migrations, and builds the app. Stage production with
`--skip-domain`, check the staged endpoint, then promote the tested deployment.
Do not deploy an old Git snapshot over uncommitted fixes; inspect status first.
The original SQLite schema/migrations are archived, not applied to PostgreSQL.

Acceptance checks: missing/wrong mock API keys return 401; the correct server
key returns 200; Shopify `/apps/proxy` returns `ok: true` and
`apiAuthenticated: true`; direct unsigned app-host proxy routes return 400.
Neither browser responses nor client assets may contain the key. These checks
use synthetic data and must not create orders or payments.

## Connected checkout tooling

Read [mock-checkout.md](mock-checkout.md) before enabling the feature. Required dependencies are the existing Node/npm/Prisma stack plus Deno and Supabase CLI for Edge Function checks/deployment. The function pins Postgres.js 3.4.7 and QRCode 1.5.4. Required skills: Shopify, Supabase, Supabase Postgres best practices, and Vercel environment/functions/deployment guidance when hosting changes are needed. Context7 provides current official documentation (`https://mcp.context7.com/mcp`); Shopify developer MCP/Theme Check validates Liquid/API code; Supabase MCP/CLI configures the isolated preview database, function, Vault and cron; Vercel MCP/CLI configures app hosting and private preview variables. Browser MCP verifies mobile/desktop customer journeys against preview. Install/authenticate each plugin separately using the existing setup sections and verify the COCO account before remote operations. GG projects are read-only references, not runtime dependencies. No payment-provider plugin or live KBZPay account is needed for this mock.

New private configuration names: `MOCK_CHECKOUT_ENABLED`, `MOCK_CHECKOUT_SHOP`, `MOCK_PAYMENT_PROVIDER_URL`, `MOCK_PAYMENT_PROVIDER_KEY`, `MOCK_PAYMENT_CALLBACK_SECRET`, `MOCK_PAYMENT_SWEEP_SECRET`; Edge Function additionally needs `MOCK_PROVIDER_DATABASE_URL` and `MOCK_PAYMENT_CALLBACK_URL`. Blank templates are committed in the app root and function directory; values belong in private host/function secret stores. Configure Vault with the sweep URL/secret and install the provided cron script only in isolated preview. Both app database URLs must point to that same isolated database. Do not run a dev server automatically.

Reproducible checkout test tooling is installed with `npm ci`: pinned PGlite 0.3.14 executes the PostgreSQL migration/privilege checks, and jsdom 26.1.0 runs DOM customer journeys without a development server. See [verification evidence](mock-checkout-verification.md) for remaining browser/preview requirements.


## Current deployment tooling and account access

Vercel MCP is now connected to team `team_O0XCmC5sCq40f01K1Syixi6i` and project `prj_nfPhXdZL2HDDIPRT3ARxMK0SZlJe`; its earlier unavailable-tool note is historical. If access returns 403, use `authorize_team_access` for this team and show the returned approval link, then retry the same connection. Do not switch teams or ask for account reconnection unnecessarily. Environment and alias APIs must remain Preview-scoped unless the user explicitly approves a Production rollout.

Supabase MCP handles admin migration/verification and Edge deployment. It lacks function-secret setting, so the existing privately stored Supabase CLI credential authenticated the Management API for four new mock-specific secrets. Token/secret values are never printed or committed. New provider/runtime roles, Vault names, the shared-database exception, exact Preview alias and deployed verification are in [mock-checkout-deployment.md](mock-checkout-deployment.md). No paid branch was created. The source migration needs an administrator for provider-schema/role creation; keep runtime privileges restricted.


Connected sample checkout adds four app configuration names: `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED`, `MOCK_PAYMENT_HOSTED_SECRET`, `MOCK_PAYMENT_HOSTED_ORIGIN`, `MOCK_PAYMENT_RETURN_ORIGINS`. The provider receives the hosted secret/origin through private Supabase Function secrets. Existing Context7, Shopify, Supabase, Vercel and browser MCP tooling/skills remain required with their documented account targets; no new plugin, library dependency or schema migration is required. Hosted routes use React Router resource responses and Node crypto. Include the provider's `_shared/hosted-token.ts` file in Edge Function deployment. Configure exact return origins including development loopback as needed; never expose secrets to theme/browser code.


### Isolated live-browser fallback

Chrome DevTools MCP was disconnected and Playwright MCP lacked its system Chrome during the 6 November rollout. A temporary Playwright 1.58.2 installation supplied headless Chromium for desktop/mobile acceptance against the deployed app/theme. No app runtime dependency or development server is involved. Setup in a temporary directory:

```sh
npm install --prefix /tmp/coco-browser-verification --ignore-scripts --no-audit --no-fund playwright@1.58.2
PLAYWRIGHT_BROWSERS_PATH=/tmp/coco-browser-verification/browsers node /tmp/coco-browser-verification/node_modules/playwright/cli.js install chromium
```

Set the same `PLAYWRIGHT_BROWSERS_PATH` when running verification scripts. Keep signed hosted URLs, capabilities and temporary private configuration out of traces/logs/screenshots and remove temporary secret files after deployment. Use only demo details and exact disposable record IDs for cleanup. The active app deployment/provider/theme targets and rollback instructions are in `mock-checkout-deployment.md`.
