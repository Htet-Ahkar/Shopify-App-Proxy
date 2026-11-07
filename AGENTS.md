# AGENTS.md

## Project boundaries

This is the COCO ORIGINAL Shopify React Router companion app. The theme at `../../coco-original` owns storefront Liquid, CSS and browser interactions; this app owns server routes, Shopify authentication, webhooks, private API calls and persistence.

- Routes are configured in `app/routes.ts`; Shopify authentication in `app/shopify.server.ts`; persistence in `app/db.server.ts` and `prisma/schema.prisma`.
- Keep secrets server-side and return only required storefront data. Use upstream timeouts, fixed/allowlisted destinations and explicit error handling.
- Verify signed app-proxy requests. Signature verification alone does not establish customer ownership. Keep `/external-api-test` authenticated.
- Royal Express data is generated from the theme's `royal-express.json`; regenerate/check it from that repo rather than hand-editing generated rates.

## Checkout invariants

- Preserve backend-owned pricing, ownership, idempotency, saved snapshots and evidence-based transitions. Never infer payment success from navigation/query parameters.
- Simulation attempts remain pending until cancellation or expiry; UAT success requires verified gateway evidence. Preserve historical terminal records and saved gateway identity.
- Do not add production charges, Shopify orders, emails, fulfillment, wallet credentials, OTP or card collection without explicit production requirements.
- Do not log delivery details, capabilities, raw callbacks, credentials, QR payloads or payment URLs. Demo logging must not affect checkout initialization.
- Use least-privileged runtime database roles. Verify targets before migrations; do not create paid resources without cost authorization.
- Keep the published theme disabled unless explicitly authorized; enabling a backend does not enable the storefront.

Read [architecture](docs/architecture.md), [checkout contract](docs/mock-checkout.md), [KBZPay UAT](docs/kbzpay-uat.md), [activity logs](docs/demo-activity-logs.md) and [deployment records](docs/mock-checkout-deployment.md) when relevant. Verify live deployment state rather than treating historical records as current state.

## Working rules

- Do not start a dev server on your own. If explicitly required, terminate it before finishing.
- Preserve staged changes. Do not restore, stage, commit or push them without authorization.
- Keep theme settings unchanged unless the task requires changing them. Theme and app deploy separately.
- Verify COCO ORIGINAL account/store/project targets before remote access. Do not reuse GG Fest accounts, configuration or secrets; reference repositories are read-only.
- Keep secrets, capabilities and customer/payment data out of browser-visible code, logs, screenshots and committed configuration.

## Documentation lookup

Use Context7 MCP before implementing features involving external libraries, frameworks, SDKs, APIs, CLIs or cloud services. Resolve the official library first and use its version-relevant documentation as the source of truth.

## Review requests

1. Inspect git status and diff first; review staged changes when present, otherwise unstaged changes.
2. Report findings first, ordered by severity, with file and line references. Clearly state when there are no blocking findings.
3. Include a concise walkthrough, suggested commit message and an appropriate `package.json` version change if applicable.

## Documentation maintenance

Keep this file limited to durable project rules. Update guidance in place; do not append task summaries, deployment records, test results or temporary tooling notes.

Required plugins, MCP servers and skills are listed below. Keep their purposes, dependencies, configuration and setup instructions current in [docs/agent-setup.md](docs/agent-setup.md). Put feature details in feature docs and release evidence in deployment records.

[docs/agent-history.md](docs/agent-history.md) preserves the previous notes. Read it only when historical context is needed; superseded behavior and task-specific permissions are not current instructions or authorization.

## Required tooling and validation

- Node/npm and existing Prisma/React Router dependencies for local checks.
- Context7 MCP for official docs; Shopify plugin's `shopify:shopify` skill for Shopify work; Shopify Dev MCP or CLI validation where applicable.
- Supabase and Postgres best-practices skills before database/schema/RLS work; Supabase MCP/CLI for authorized remote operations. Deno/Supabase CLI apply when maintaining Edge Functions.
- Relevant Vercel CLI/environment/Functions/deployment skills and Vercel MCP/CLI for hosting work. Account authorization is separate from plugin installation.
- Chrome DevTools/Playwright MCP or isolated Playwright/Chromium for storefront acceptance; setup is in the tooling guide. No payment-provider plugin is required.
- Run checks appropriate to changes: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and related theme checks. Prisma generation is local; `setup`, `vercel-build` and migrations may mutate a database and require a verified target and task authorization.
