# AGENTS.md

## Project Context

This repository is the Shopify app companion for the COCO ORIGINAL Shopify theme.

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
- Prisma stores Shopify sessions in a local SQLite database in development.

## Theme Relationship

The intended relationship is:

1. The COCO ORIGINAL theme renders storefront pages and browser interactions.
2. The theme calls this app only when it needs server-side capabilities.
3. This app calls external APIs using private environment variables.
4. This app returns sanitized responses to the theme.

Typical flow:

```text
Shopify theme -> /apps/... storefront app proxy -> this app -> external API -> this app -> theme
```

Important:

- Despite the project name, no storefront app proxy route or `[app_proxy]` config was found yet.
- Do not assume `/apps/...` endpoints exist until both Shopify app proxy configuration and matching public routes are added.
- When implementing app proxy routes, verify Shopify app proxy signatures before trusting request data.
- Keep external API secrets in the app host environment, never in theme files or storefront-visible settings.

## Deployment Relationship

The theme and app deploy separately:

- The theme deploys to Shopify Online Store.
- This app deploys to an app host such as Vercel.

If this app is later moved inside the theme repository, prefer a monorepo-style path such as:

```text
coco-original/
  apps/
    app-proxy/
```

In that layout, configure Vercel's root directory to the app subdirectory (`apps/app-proxy`), not the Shopify theme root.

## External API Role

The main expected purpose for this app is calling external APIs that the theme cannot safely call directly.

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
