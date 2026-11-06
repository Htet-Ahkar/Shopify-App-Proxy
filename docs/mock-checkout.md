# Signed sample checkout API

Current source replaces the payment simulator with local sample responses. Historical deployment evidence is retained in `mock-checkout-deployment.md`; the backend and unpublished Dev Preview are deployed as recorded there; retiring remote simulator resources remains separate work.

## Authentication and contract

`POST /apps/proxy/mock-checkout` maps to app route `/external-api/mock-checkout`. Requests require verified Shopify app proxy signatures, the configured shop and offline app session, JSON content type, and a 64-hex browser capability. A signed customer ID binds customer-owned records. Never trust a customer ID supplied in the JSON body. Responses retain `mock: true` and private/no-store headers. Delivery data is only returned to the owner.

Supported operations:

| Operation | Inputs besides capability | Result |
| --- | --- | --- |
| `quote` | catalog `lines` or `source: "sample"` | quote ID, server-priced snapshot, five-minute deadline |
| `create` | quoteId, idempotencyKey, method, delivery | persistent checkout/attempt and instructions |
| `status` | checkoutId, or saved idempotencyKey | same checkout/attempt, authoritative local status |
| `cancel` | checkoutId, current attemptId | cancelled unless already terminal/expired |
| `retry` | checkoutId, new idempotencyKey, method | new attempt after cancellation/failure, same checkout deadline |

Methods remain `kbzpay` and `mmqr`. `simulate` returns `invalid_operation`; the hosted gateway and callback routes no longer exist. Neither body/query status fields nor navigation can approve payment.

`quote` sample mode requires `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED=true` and freezes the fictional jersey at 35,000 MMK, quantity one, zero shipping/tax. Catalog quotes read Shopify prices and require MMK. Create/retry retain serializable transactions and retry write/unique conflicts. Lost creation responses recover through the saved idempotency key.

## Instructions and lifecycle

New attempts are atomically persisted as ready/pending with a local reference `SAMPLE-<attempt ID>`. The legacy `providerId` field name and `environment: "simulation"` database constraint are retained for compatibility; neither indicates a provider transaction.

PWA instructions:

```json
{"pwaUrl":"https://www.kbzpay.com/en"}
```

MMQR instructions:

```json
{"qrPayload":"COCO-SAMPLE-MMQR:NOT-PAYABLE:<attempt ID>"}
```

No `qrImage` is returned. The frontend generates the PNG locally with QRCode 1.5.4. The public PWA website is not a payment session and the QR is non-payable. New attempts remain pending until cancellation or server expiry at the original fifteen-minute checkout deadline. Retry never extends that deadline. Historical success/failure states are readable but cannot be produced by this implementation.

Status verifies ownership before mutation. Old pending simulator attempts are cancelled when resumed (expired if past deadline), retain their historical stored instructions, expose no obsolete links/images, and may retry before checkout expiry. Historical terminal rows and event history are retained. Existing schemas/migrations remain unchanged; no data migration is required.

The existing protected `/internal/mock-payments-sweep` endpoint processes up to 50 due pending attempts for local expiry/retirement. It performs no external dispatch, callbacks, payment reconciliation or record deletion. Its optional scheduler retains the existing route/secret names for compatibility. Status polling also applies expiry, so cron is not required for storefront correctness.

## Setup and verification

Required runtime configuration: Shopify app credentials/session setup, `DATABASE_URL`, `DIRECT_URL`, `MOCK_CHECKOUT_ENABLED=true`, `MOCK_CHECKOUT_SHOP`, and optional `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED=true`. The optional sweep requires `MOCK_PAYMENT_SWEEP_SECRET`. `.env.example` lists these names without secrets. Old provider/callback/hosted secrets and return origins are unused by checkout; the unrelated external API proof of concept remains independent.

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. `COCO_THEME_PATH` overrides the default sibling theme location for DOM tests. In the theme, `npm run test:checkout-qr` decodes the shipped browser bundle output. No dev server is needed. Tests cover signatures, shop/customer/capability ownership, pricing, idempotency, cancellation, retry, expiry, removed operations, historical records, stale QR generation, download warnings, reload and rendering errors.

Required tools/skills and their setup are documented in `AGENTS.md` and `docs/agent-setup.md`. No new backend dependency, migration, KBZPay account, provider secret, or payment-provider plugin is needed. Remote Supabase/Vercel changes and deployment require separate work; preserve deployed resources and the published theme setting during this implementation.
