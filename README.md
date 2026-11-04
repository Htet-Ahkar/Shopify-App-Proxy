# Shopify checkout proxy app

This Shopify React Router app is the server-side companion to the [COCO ORIGINAL theme](../../coco-original). Its purpose is to call external APIs for the theme's custom checkout while keeping private credentials on the app server.

Themes can call public external APIs when the service permits browser access. Calls requiring private credentials belong in this app. Never place secrets in Liquid, browser JavaScript, theme settings, or storefront responses.

## Current status

The app provides an `EXTERNAL_API_URL` proof of concept (POC): verify a Shopify proxy request, make a fixed upstream GET, and return selected todo fields. The upstream request now requires server-only `EXTERNAL_API_SECRET`, sent as `x-api-key`. A separately hosted Supabase mock API rejects missing or incorrect keys. See [the authenticated POC guide](docs/authenticated-poc.md).

```text
Theme GET /apps/proxy
  → Shopify app proxy
  → App /external-api
  → Shopify signature verification
  → GET EXTERNAL_API_URL
  → Selected JSON fields returned to theme
```

The theme has a separate proxy test section. Its custom checkout remains a browser-only mock, unconnected to this app. Provider choice and real checkout operations remain pending; live integration is future work.

See the [architecture and integration guide](docs/architecture.md) for endpoints, responses, manual verification, and production gaps. [AGENTS.md](AGENTS.md) contains repository working rules.

## Local setup

Prerequisites:

- Node.js satisfying `>=20.19 <22 || >=22.12` (from `package.json`) and npm.
- Shopify CLI, access to the associated Shopify app, and a development store where it can be installed.
- A test external API returning an object with `userId`, `id`, `title`, and `completed` fields.

Install dependencies and create the environment file only if one does not already exist:

```sh
npm ci
cp .env.example .env
```

Do not overwrite an existing `.env` or commit credentials. Fill in local values or supply them through the development environment; hosted values belong in the app host environment.

| Variable | Purpose |
| --- | --- |
| `EXTERNAL_API_SECRET` | Server-only key sent in `x-api-key`; never returned to the storefront. |
| `EXTERNAL_API_URL` | Server-controlled URL fetched by the POC. No storefront-supplied URL is accepted. |
| `SHOPIFY_APP_URL` | Public HTTPS origin of the app, aligned with active Shopify configuration. |
| `SHOPIFY_API_KEY` | Shopify app API key. |
| `SHOPIFY_API_SECRET` | Private Shopify app secret used by authentication helpers. |
| `DATABASE_URL` | Supabase transaction pooler connection for the app (port 6543), with `pgbouncer=true&connection_limit=1&schema=shopify&sslmode=require`. |
| `DIRECT_URL` | Supabase session pooler connection for migrations (port 5432), with `schema=shopify&sslmode=require`. |
| `SCOPES` | Comma-separated scopes aligned with `shopify.app.toml`: currently `write_app_proxy,write_metaobject_definitions,write_metaobjects,write_products`. |

Optional variables used by `app/shopify.server.ts` are `VERCEL_PROJECT_PRODUCTION_URL` (hostname fallback when `SHOPIFY_APP_URL` is absent) and `SHOP_CUSTOM_DOMAIN` (custom shop domain authentication configuration). Neither is in `.env.example`. The POC uses a generated mock API key. It is not a payment gateway credential.

Initialize Prisma session storage:

```sh
npm run setup
```

This generates Prisma Client and applies PostgreSQL migrations using `DIRECT_URL`. The original SQLite schema and migrations are archived in `prisma/sqlite-archive`; existing SQLite files are not deleted. Set the two database variables before running setup. Start development only when explicitly needed:

```sh
npm run dev
```

Shopify CLI handles the development app connection and tunnel. Confirm the active proxy configuration before testing through the storefront. Stop the server when finished.

## Commands and deployment

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the React Router app. |
| `npm run typecheck` | Generate route types and check TypeScript. |
| `npm run lint` | Run ESLint. |
| `npm run setup` | Generate Prisma Client and apply migrations. |
| `npm run start` | Serve the built app. |
| `npm run deploy` | Deploy Shopify app configuration/extensions through Shopify CLI; app hosting is separate. |

The theme deploys to Shopify Online Store; this app deploys separately to an app host. `shopify.app.toml` currently points application, callback, and proxy URLs at `https://shopify-app-proxy-htetahkars-projects.vercel.app`. These are repository configuration values, not confirmation of a working deployment. Deployment health and durable production session storage remain unverified.

Prisma uses Supabase PostgreSQL in the private `shopify` schema. Keep the schema outside Supabase Data API exposed schemas. The dedicated database login owns only the app schema; do not use a Supabase browser API key as a database password. The embedded Admin home still has template actions creating products, metafields, and metaobjects; those are unrelated to this POC.

## Checkout boundaries

Keep checkout UI in the theme and secrets and external requests in this app. The mock must not create real Shopify orders, call real payment gateways, transmit real card data, or store payment details. Mock responses must remain clearly labeled as simulated/demo behavior.

Official [Shopify proxy documentation](https://shopify.dev/docs/apps/build/online-store/app-proxies) explains the storefront mapping. The integration guide includes authentication and configuration references checked through Context7.

## Supabase session storage deployment

The active datasource requires Prisma 6-compatible `DATABASE_URL` and `DIRECT_URL`.
Store connection strings as Vercel Secrets for the intended environment only.
The `shopify` schema must be owned by the dedicated app database role, which
requires LOGIN and CONNECT but no superuser, CREATEDB, CREATEROLE or BYPASSRLS.
The schema is private; do not expose it in Supabase Data API settings or grant
`anon`/`authenticated` access. RLS is enabled on Session. The owning backend
role can read/write its own table without a public policy.

`vercel.json` runs `npm run vercel-build`: generate Prisma Client, apply pending
PostgreSQL migrations, then build React Router. Preview environments must use a
separate non-production database with preview-only credentials. Both
`DATABASE_URL` and `DIRECT_URL` must target that same isolated database and use
`schema=shopify`. The existing migration explicitly targets the `shopify` schema;
changing only the URL schema does not isolate it.

After switching databases, open the installed app in Shopify Admin to establish
a new session. Verify storefront `/apps/proxy` returns `ok: true`; a direct,
unsigned request to app-host `/external-api` must still fail. Storage failures
return HTTP 500 with a safe message instead of an authentication 400. Payment-provider
credentials and real payment operations remain unimplemented.

## Agent tooling handoff

See [docs/agent-setup.md](docs/agent-setup.md) for required plugins, MCP servers, skills, account targets, dependencies, configuration, and secure setup instructions. Keep this guide current when tooling changes.
