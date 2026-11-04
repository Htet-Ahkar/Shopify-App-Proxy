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
| `/external-api-test` | Separate diagnostic loader calling the same upstream. | None. |

These routes implement read loaders; there is no checkout POST action or order/payment endpoint. Direct unsigned requests to the protected app-host paths should fail verification.

After authentication, the signed loader reads `EXTERNAL_API_URL` and makes a GET with `Accept: application/json`. It forwards no shopper payload, browser cookies, Shopify token, or provider credential. The URL comes from the server environment, not from request input.

A successful upstream JSON object produces HTTP 200:

```json
{
  "ok": true,
  "userId": 1,
  "id": 1,
  "title": "Example todo",
  "completed": false
}
```

Only these fields are returned. `userId` and `id` default to `null` unless numbers; `title` defaults to `""` unless a string; `completed` defaults to `false` unless a boolean. These are demo fields, not a checkout schema. The TypeScript cast does not validate the whole upstream structure: JSON `null` fails during field access and reaches the error handler.

The JSON helpers set `Content-Type: application/json` and `Cache-Control: no-store` on success and handled errors. Framework or Shopify responses outside those helpers are not covered by that guarantee.

| Condition | Current app response |
| --- | --- |
| Proxy authentication throws | Error `App proxy request could not be verified by Shopify.`; numeric `error.status` if present, otherwise 400. Payload also includes `request` and `proxyRequestInfo`. |
| Missing `EXTERNAL_API_URL` | HTTP 500, `External API URL is not configured.` |
| Non-success upstream HTTP status | Same upstream status, `External API request failed.`; upstream body is not forwarded. |
| Fetch or JSON processing throws | HTTP 502, `External API request failed.` |
| Abort detected as a `DOMException` named `AbortError` | HTTP 502, `External API request timed out.` |

Errors use `{ "ok": false, "error": "..." }`, with additional diagnostics on authentication failure. Both loaders abort after 5,000 ms using `AbortController` and clear the timer in `finally`. Aborts not matching the explicit detection condition get the generic 502 message. Bodyless upstream statuses such as 304 are a limitation: constructing a JSON response for them can throw and fall through to generic 502.

The diagnostic route has the same success shape and upstream error/timeout behavior without the authentication step. It can call the configured API without going through Shopify and is not protected by the signed routes.

## Authentication, storage, and deployment

The signed loader uses Shopify's `authenticate.public.appProxy(request)` before fetching upstream data. The [React Router app proxy helper](https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/public/app-proxy) supplies the authentication context. The current loader logs context availability without requiring an Admin client or session to be present.

Signature verification establishes that Shopify signed the request. It does not authorize ownership of a customer's cart, checkout, order, or other resource. The POC only checks whether `logged_in_customer_id` is present for diagnostics. It does not enforce customer login, resource ownership, per-shop access policy, or rate limits.

The signed handler logs request metadata and authentication outcomes. On authentication failure, its JSON payload includes the `request` object and proxy metadata; `Request` serialization is runtime-dependent and is not a stable diagnostic contract. Replace these with minimal client errors and redacted server diagnostics before processing real checkout data. The theme test section also logs complete proxy responses to the browser console.

Other template responsibilities remain:

- Embedded Admin routes authenticate with `authenticate.admin(request)`. The home action creates a demo product and metafield, updates a variant, and upserts a demo metaobject. These mutations are unrelated to the POC.
- `/webhooks/app/uninstalled` authenticates the webhook and deletes the shop's sessions when a session is available.
- `/webhooks/app/scopes_update` authenticates the webhook and updates the available session's scopes from the payload.
- Prisma stores Shopify session/token information at `prisma/dev.sqlite`. There are no checkout or payment models and no production datasource override in the schema.

The server selects Admin API version October 2025, while the webhook configuration declares `2026-07`. These are existing settings; they are not aligned by this documentation work.

`shopify.app.toml` points to `https://shopify-app-proxy-htetahkars-projects.vercel.app`, with `/auth/callback` for the callback and `/external-api` for the proxy target. Server configuration uses `SHOPIFY_APP_URL` with a fallback to `https://${VERCEL_PROJECT_PRODUCTION_URL}`. These values do not establish that deployment, routes, installation, or persistence work. Production health and durable session storage remain unverified.

The theme and app server deploy separately. `npm run deploy` runs Shopify CLI app deployment for configuration/extensions; app hosting is separate. Shopify describes configuration activation in its [app configuration reference](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration#app_proxy). This guide does not prescribe or verify a Vercel deployment setup.

## Manual verification scenarios

These are instructions for a controlled development environment, not tests executed by this documentation update. Use synthetic upstream data and request counters/logs. Do not change production configuration, use real customer/payment data, or start a server solely to validate documentation.

| Scenario | Procedure | Expected result |
| --- | --- | --- |
| Proxy success | Configure a synthetic todo response as `EXTERNAL_API_URL`; open the theme test section or GET `/apps/proxy` on the development store. | HTTP 200, only the five documented fields, JSON and `no-store` headers from the app. Extra upstream fields excluded. |
| Field defaults | Return an object with missing or incorrectly typed todo fields. | HTTP 200, `ok: true`, defaults `null`, `null`, `""`, `false`. |
| Rejected signature | GET app-host `/external-api` and its alias without signed parameters, or with a fabricated signature. | Authentication error with the helper's numeric status or fallback 400; upstream not called. |
| Missing configuration | Temporarily unset `EXTERNAL_API_URL` in isolated development, reload as required, and make a valid proxied request. | HTTP 500 with configuration error; upstream not called. Restore the variable afterward. |
| Upstream failure | Return upstream 503, then separately HTTP 200 with malformed JSON. | HTTP 503 with generic error, then HTTP 502 for malformed JSON. No upstream body exposed. |
| Timeout | Delay the test upstream beyond five seconds; call through the proxy. | Abort around five seconds, HTTP 502; timeout message depends on the detection condition above. |
| Diagnostic access | GET app-host `/external-api-test` without Shopify parameters, using only the synthetic upstream. | Upstream called without Shopify authentication, confirming the protection gap. |

For HTML or routing errors, check installation, active storefront proxy path, target URL, and whether configuration was applied. An unsigned app-host call is not a proxy success test.

## Future checkout integration

Define the external provider and required operations with request/response contracts before connecting checkout. Keep the current mock explicitly simulated until production requirements are agreed.

- Add provider-specific server-side credentials and authentication, returning only fields needed by the storefront.
- Validate checkout requests, resource ownership, and server-authoritative values. Proxy signatures alone do not authorize customer operations.
- Establish shop/customer access rules and abuse controls. Remove or protect the diagnostic bypass before connecting a credentialed upstream.
- Replace POC logs and client diagnostics before processing customer data; define safe provider error mapping and operation-specific timeouts.
- Establish and verify durable production session storage and the host deployment process before relying on them for live flows.

The mock must not create real Shopify orders, call real payment gateways, transmit real card data, or store payment details. Do not store payment details in Prisma, Shopify metafields, cart attributes, logs, or external APIs. Mock responses must remain labeled as simulated/demo behavior. Production payment APIs, order creation, retries, and persistence contracts remain undecided.

The official Shopify references above were checked through Context7. Code-specific descriptions reflect the repository POC, including its limitations.
