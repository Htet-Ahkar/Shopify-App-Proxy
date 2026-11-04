# Secret-authenticated API proof of concept

## Flow

Theme GET /apps/proxy -> Shopify signature -> Vercel /external-api -> HTTPS
Supabase Edge Function /functions/v1/mock-external-api with x-api-key -> safe JSON.

The mock provider is a separate HTTP service hosted in the COCO ORIGINAL
Supabase project. It performs no database reads/writes or payment operations.
The Vercel app holds EXTERNAL_API_SECRET; the function holds the matching
MOCK_EXTERNAL_API_SECRET. Neither is a Supabase service-role key or Shopify
app secret. Missing or wrong keys return 401. A missing server configuration
fails closed. Only GET is accepted. No credentials are returned or logged.

The function uses its own API-key authentication, so its Supabase
verify_jwt setting is false. This does not disable its in-function key check.

## Runtime configuration

Vercel production Secrets:

- EXTERNAL_API_URL: https://jsiqibwdsvvhwhlvhisj.supabase.co/functions/v1/mock-external-api
- EXTERNAL_API_SECRET: generated random key; never store in source or browser code.

Supabase Edge Function Secret:

- MOCK_EXTERNAL_API_SECRET: the matching key.

Use separate keys in isolated development/preview environments. When rotating,
stage coordinated changes on both services; changing only one side causes 401.

## Verification

- Direct mock endpoint without x-api-key: 401.
- Direct mock endpoint with an incorrect key: 401.
- Correct key from the app server: 200 and authenticated: true.
- Storefront /apps/proxy: 200, ok: true, apiAuthenticated: true, selected demo fields.
- Direct unsigned app-host /external-api and /external-api-test: 400; no upstream call.
- Browser requests/responses and built client assets must not contain the API key.

The Node tests cover key rejection, successful authentication, sanitization,
configuration errors, and rejected redirects/HTTP configuration. The deployed
POC must also be checked end to end. Existing checkout UI remains simulated.

The mock demonstrates the server-side secret boundary. A real gateway sandbox
needs its own provider-specific authentication and API contract; this test
creates no transaction and does not establish a production payment integration.
