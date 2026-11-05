# Architecture and integration guide

## Responsibilities and request flow

The COCO ORIGINAL theme (`../../coco-original`, relative to the repository root) owns Liquid, styling, and browser interactions. This app owns Shopify authentication, server routes, sessions, and external API calls requiring private credentials. Public APIs that permit browser access can be called from a theme; private credentials must remain on the server.

Today this is a read-only `EXTERNAL_API_URL` connectivity POC. The provider and real checkout operations remain undecided. See the [README](../README.md) for setup and environment variables.

```text
Theme GET /apps/proxy
  → Shopify app proxy
  → App /external-api
  → Shopify signature verification
  → GET EXTERNAL_API_URL
  → Selected JSON fields returned to theme
```

`shopify.app.toml` defines `[app_proxy]` with prefix `apps`, subpath `proxy`, and an absolute target ending in `/external-api` at the configured Vercel host. Shopify forwards matching storefront requests to this app URL with signed proxy parameters. Extra storefront path components are appended to the target path. Merchants can customize the storefront proxy path; confirm the installed store's active configuration. See Shopify's [proxy mapping](https://shopify.dev/docs/apps/build/online-store/app-proxies) and [forwarding/signature reference](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies).

The theme's `sections/app-proxy-test.liquid` fetches `/apps/proxy`, but its success label says `/apps/proxy/external-api`. That label is misleading: with the repository configuration, this storefront URL would forward to app `/external-api/external-api`, which has no matching route. The theme is unchanged by this documentation update.

The separate `assets/custom-checkout.js` mock uses browser state, including `sessionStorage`. It currently makes no fetch calls to this app.

## Endpoints and responses

`app/routes.ts` discovers routes with `flatRoutes()`. All paths below are on the app host unless marked storefront.

| Path | Behavior | Authentication |
| --- | --- | --- |
| Storefront `/apps/proxy` | Shopify forwards GET to app `/external-api`. | Shopify signs the forwarded request; the app verifies it. |
| `/external-api` | Re-exports the loader from `app/routes/apps.proxy.external-api.tsx`. | `authenticate.public.appProxy(request)`. |
| `/apps/proxy/external-api` | App-host alias for the same loader; not the configured storefront entrypoint. | Same proxy verification. |
| `/external-api-test` | Re-exports the signed loader. | Same Shopify proxy verification. |

These routes implement read loaders; there is no checkout POST action or order/payment endpoint. Direct unsigned requests to the protected app-host paths should fail verification.

After authentication, the signed loader reads `EXTERNAL_API_URL` and makes a GET with `Accept: application/json`. It sends only the server-owned `EXTERNAL_API_SECRET` in `x-api-key`; it forwards no shopper payload, browser cookies, or Shopify token. Only HTTPS upstreams are allowed, and redirects are disabled. The URL comes from the server environment, not from request input.

A successful upstream JSON object produces HTTP 200:

```json
{
  "ok": true,
  "userId": 1,
  "id": 1,
  "title": "Example todo",
  "completed": false,
  "apiAuthenticated": true
}
```

Only these fields are returned. `apiAuthenticated` is true only when the mock provider returns `authenticated: true`. `userId` and `id` default to `null` unless numbers; `title` defaults to `""` unless a string; `completed` defaults to `false` unless a boolean. These are demo fields, not a checkout schema. The TypeScript cast does not validate the whole upstream structure: JSON `null` fails during field access and reaches the error handler.

The JSON helpers set `Content-Type: application/json` and `Cache-Control: no-store` on success and handled errors. Framework or Shopify responses outside those helpers are not covered by that guarantee.

| Condition | Current app response |
| --- | --- |
| Proxy authentication throws | Error `App proxy request could not be verified by Shopify.`; numeric `error.status` if present, otherwise 500. Client errors receive a safe signature-verification message; server/storage errors receive `App proxy session storage is unavailable.` No request metadata is returned. |
| Missing `EXTERNAL_API_URL` | HTTP 500, `External API URL is not configured.` |
| Non-success upstream HTTP status | Same upstream status, `External API request failed.`; upstream body is not forwarded. |
| Fetch or JSON processing throws | HTTP 502, `External API request failed.` |
| Abort detected as a `DOMException` named `AbortError` | HTTP 502, `External API request timed out.` |

Errors use `{ "ok": false, "error": "..." }`, without forwarding request metadata or provider response bodies. The signed loader aborts after 5,000 ms using `AbortController` and clear the timer in `finally`. Aborts not matching the explicit detection condition get the generic 502 message. Bodyless upstream statuses such as 304 are a limitation: constructing a JSON response for them can throw and fall through to generic 502.

The former diagnostic route now re-exports the signed loader. Unsigned requests are rejected before any credentialed upstream request.

## Authentication, storage, and deployment

The signed loader uses Shopify's `authenticate.public.appProxy(request)` before fetching upstream data. The [React Router app proxy helper](https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/public/app-proxy) supplies the authentication context. The current loader logs context availability without requiring an Admin client or session to be present.

Signature verification establishes that Shopify signed the request. It does not authorize ownership of a customer's cart, checkout, order, or other resource. The POC only checks whether `logged_in_customer_id` is present for diagnostics. It does not enforce customer login, resource ownership, per-shop access policy, or rate limits.

The signed handler logs request metadata and authentication outcomes. Authentication/storage failures return minimal client errors; request and proxy metadata remain server-side diagnostics. The theme test section also logs complete proxy responses to the browser console.

Other template responsibilities remain:

- Embedded Admin routes authenticate with `authenticate.admin(request)`. The home action creates a demo product and metafield, updates a variant, and upserts a demo metaobject. These mutations are unrelated to the POC.
- `/webhooks/app/uninstalled` authenticates the webhook and deletes the shop's sessions when a session is available.
- `/webhooks/app/scopes_update` authenticates the webhook and updates the available session's scopes from the payload.
- Prisma stores Shopify session/token information in Supabase PostgreSQL, in the private `shopify` schema, using server-only pooled `DATABASE_URL` and migration `DIRECT_URL`. There are no checkout or payment models and no production datasource override in the schema.

The server selects Admin API version October 2025, while the webhook configuration declares `2026-07`. These are existing settings; they are not aligned by this documentation work.

`shopify.app.toml` points to `https://shopify-app-proxy-htetahkars-projects.vercel.app`, with `/auth/callback` for the callback and `/external-api` for the proxy target. Server configuration uses `SHOPIFY_APP_URL` with a fallback to `https://${VERCEL_PROJECT_PRODUCTION_URL}`. These values do not establish that deployment, routes, installation, or persistence work. Deployment health and session storage must be verified against the active deployment.

The theme and app server deploy separately. `npm run deploy` runs Shopify CLI app deployment for configuration/extensions; app hosting is separate. Shopify describes configuration activation in its [app configuration reference](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration#app_proxy). This guide does not prescribe or verify a Vercel deployment setup.

## Manual verification scenarios

These are instructions for a controlled development environment, not tests executed by this documentation update. Use synthetic upstream data and request counters/logs. Do not change production configuration, use real customer/payment data, or start a server solely to validate documentation.

| Scenario | Procedure | Expected result |
| --- | --- | --- |
| Proxy success | Configure a protected synthetic todo API as `EXTERNAL_API_URL` and its key as `EXTERNAL_API_SECRET`; open the theme test section or GET `/apps/proxy` on the development store. | HTTP 200, only the documented fields, including `apiAuthenticated: true`, JSON and `no-store` headers from the app. Extra upstream fields excluded. |
| Field defaults | Return an object with missing or incorrectly typed todo fields. | HTTP 200, `ok: true`, defaults `null`, `null`, `""`, `false`. |
| Rejected signature | GET app-host `/external-api` and its alias without signed parameters, or with a fabricated signature. | Authentication error with the helper's numeric status or fallback 500 for non-Response server failures; upstream not called. |
| Missing configuration | Temporarily unset `EXTERNAL_API_URL` in isolated development, reload as required, and make a valid proxied request. | HTTP 500 with configuration error; upstream not called. Restore the variable afterward. |
| Upstream failure | Return upstream 503, then separately HTTP 200 with malformed JSON. | HTTP 503 with generic error, then HTTP 502 for malformed JSON. No upstream body exposed. |
| Timeout | Delay the test upstream beyond five seconds; call through the proxy. | Abort around five seconds, HTTP 502; timeout message depends on the detection condition above. |
| Diagnostic access | GET app-host `/external-api-test` without Shopify parameters. | HTTP 400; the credentialed upstream is not called. |

For HTML or routing errors, check installation, active storefront proxy path, target URL, and whether configuration was applied. An unsigned app-host call is not a proxy success test.

## Future checkout integration

Define the external provider and required operations with request/response contracts before connecting checkout. Keep the current mock explicitly simulated until production requirements are agreed.

- Add provider-specific server-side credentials and authentication, returning only fields needed by the storefront.
- Validate checkout requests, resource ownership, and server-authoritative values. Proxy signatures alone do not authorize customer operations.
- Establish shop/customer access rules and abuse controls. The diagnostic bypass is now protected; keep all upstream entrypoints authenticated.
- Replace POC logs and client diagnostics before processing customer data; define safe provider error mapping and operation-specific timeouts.
- Establish and verify durable production session storage and the host deployment process before relying on them for live flows.

The mock must not create real Shopify orders, call real payment gateways, transmit real card data, or store payment details. Do not store payment details in Prisma, Shopify metafields, cart attributes, logs, or external APIs. Mock responses must remain labeled as simulated/demo behavior. Production payment APIs, order creation, retries, and persistence contracts remain undecided.

The official Shopify references above were checked through Context7. Code-specific descriptions reflect the repository POC, including its limitations.

The API-key POC setup and current response field `apiAuthenticated` are documented in [authenticated-poc.md](authenticated-poc.md).

## Connected mock checkout

The authenticated read-only POC remains available independently. The new connected mock checkout is implemented behind explicit server/theme feature flags and uses private Prisma records, a separately authenticated mock provider, signed callbacks, and reconciliation. See [mock-checkout.md](mock-checkout.md) for the complete contract, environment names, preview setup, customer journey, limitations, tests, and rollout. Source implementation does not establish deployment or end-to-end browser verification.
