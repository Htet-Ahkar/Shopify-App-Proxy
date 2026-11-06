# KBZPay simulation and UAT checkout

Current source supersedes the older sample-only and hosted-simulator implementation. The user-authorized simulation rollout is deployed as recorded in [mock-checkout-deployment.md](mock-checkout-deployment.md); UAT remains inactive. Only private checkout/payment records are updated: no Shopify orders, email, fulfillment, production payments or fake gateway pages.

## Storefront contract

Signed JSON `POST /apps/proxy/mock-checkout` maps to `/external-api/mock-checkout`. Shopify proxy verification, matching configured COCO shop/offline session, a 64-hex browser capability and signed customer ownership remain required. Responses use `mock: true` for compatibility and private/no-store headers; UAT is identified by `paymentEnvironment: "uat"`, simulation by `"simulation"`.

| Operation | Additional inputs | Result |
| --- | --- | --- |
| quote | catalog lines or `source: "sample"` | Server-priced snapshot and five-minute quote |
| create | quoteId, idempotencyKey, method, delivery | Durable checkout/attempt and payment instructions |
| status | checkoutId or saved idempotencyKey | Owned checkout, verified payment status and recovery |
| cancel | checkoutId, current attemptId | Verified cancellation or pending/reconciliation error |
| retry | checkoutId, new idempotencyKey, method | New attempt after confirmed failure/cancellation |

Methods are `kbzpay` and `mmqr`. Instructions remain `{pwaUrl}` or `{qrPayload}`; no `qrImage`. The theme generates and downloads QR images locally. `simulate` remains rejected; browser/query status fields and navigation cannot approve payments. Attempts additionally expose the verified gateway `transactionId` when available. Late success presents the successful attempt's receipt, even if a newer attempt existed.

Quotes freeze exact MMK amounts. The fictional 35,000 MMK sample product requires `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED=true`. Catalog pricing is unchanged. Checkout lifetime remains 15 minutes; retries never extend it.

## Simulation

`KBZPAY_MODE=simulation` is the default. No KBZPay calls or credentials are used. PWA instructions point to `https://www.kbzpay.com/en`; MMQR contains `COCO-SAMPLE-MMQR:NOT-PAYABLE:<attempt ID>`. Neither is a payment session. The backend considers a new simulation paid after 10 seconds and persists success when status polling or the protected sweep next reconciles it, even after a browser reload or a long absence. There is no process-local timer and navigation has no effect. Cancellation before the success deadline prevents later automatic success.

Historical attempts without persisted gateway identity are retired on resume: pending becomes cancelled, or expired after its deadline. Historical terminal records stay unchanged. Their old instructions are never exposed. They cannot acquire automatic success by changing the configured mode.

## UAT protocol and lifecycle

`KBZPAY_MODE=uat` connects directly to KBZPay. Configuration is validated before a new attempt is claimed; no production mode or simulation fallback exists. See [UAT setup](kbzpay-uat.md).

The adapter uses `kbz.payment.precreate` version 1.0, `PWAAPP` or `PAY_BY_QRCODE`, and `queryorder`/`closeorder` version 3.0. It flattens signable fields, excludes empty/sign/sign_type/array values, sorts ASCII parameter names, appends `&key=<app key>` and computes uppercase SHA256. Extended scalar fields participate in verification. Ambiguous flattened names and unsafe JSON numbers are rejected.

Each attempt persists its environment, unique alphanumeric merchant order reference, gateway/merchant/PWA/notification identity and a signing-key fingerprint (never the secret). Mode/merchant URL changes cannot reinterpret existing attempts. The current app key must match the saved fingerprint to reconcile an old UAT attempt; retain that key until its payments are resolved. Key rotation across unresolved attempts needs an explicit credential-version/keyring extension; do not overwrite the key and assume old attempts remain recoverable.

A serializable transaction claims the merchant reference before network I/O. Precreate is dispatched once for a newly claimed attempt, outside the transaction. Lost responses, rejection, malformed bodies, bad signatures and timeouts leave a durable `reconciliation_required` attempt. Repeating create with the same idempotency key never repeats precreate. Status and sweep query the original merchant reference. A pending query cannot reconstruct a lost QR/PWA initialization response; confirm gateway closure before retrying. Unknown/not-found gateway responses remain unresolved rather than being guessed safe for retry.

Gateway responses require verified SHA256 signatures. Query success must match merchant order reference, amount/currency and any returned merchant identifiers, with a gateway transaction reference for paid results. Notifications require all merchant identity, reference, amount and currency fields. Success evidence is persisted atomically with checkout success and an idempotent event. Callback payment success can supersede a previously cancelled/expired attempt; it cannot create a second checkout. If another attempt is pending after late success, status/sweep tries to close it; uncertainty remains pending and its instructions are hidden. Multiple actual gateway transactions, if ever reported, retain their evidence for manual investigation; no automatic refund exists.

Cancellation queries first, invokes close only for pending UAT payments, then queries again. Only confirmed gateway closure/failure/expiry unlocks the applicable next action. Uncertain initialization cannot be cancelled during its initial 10-second dispatch window. Transport errors return `payment_reconciling`; a still-pending closure result keeps retry disabled. Local time alone never declares a UAT payment unpaid or safe to retry. Instructions hide at the local deadline while reconciliation continues.

Outbound requests have eight-second deadlines, redirect rejection and 32 KiB response limits. New UAT retries require at least one whole minute remaining; they never extend the checkout deadline. Reconciliation is spaced by 10 seconds per pending attempt. The existing bearer-protected `POST /internal/mock-payments-sweep` checks at most five due attempts concurrently; it does not delete history. Polling also recovers payments, but configure the scheduler for unattended/missed-callback recovery. No logs contain signed payloads, credentials, capabilities or delivery details.

## Callback

KBZPay directly posts its JSON `Request` envelope to `POST /payments/kbzpay/notify` on the app host, not through the Shopify proxy. The route requires checkout enabled, JSON and a body of at most 16 KiB. It verifies evidence using the attempt's saved UAT identity, accepts only `PAY_SUCCESS`, and returns HTTP 200 with plain text `success` only after durable persistence. Repeated notifications are idempotent. Invalid signatures/mismatches are rejected; storage failure returns 503 so KBZPay can retry. Simulation attempts reject gateway notifications. The route has no Shopify-login dependency.

## Validation and release boundary

Run `npm ci`, `npx prisma generate`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. `npm test` includes isolated PGlite migration tests, protocol/lifecycle tests and companion-theme DOM journeys. Set `COCO_THEME_PATH` if needed. In the theme run `npm run test:checkout-qr`; the generated QR bundle is unchanged. Theme Check can validate Liquid/locale changes without a dev server.

Apply the additive `20261106000000_kbzpay_uat` migration only during an authorized release to the verified COCO database, before starting the new code. No remote schema/configuration/deployment changes are part of source preparation. Older code retires new simulation attempts and cannot safely interpret UAT state, so do not roll back app code while unresolved UAT attempts exist. Set `KBZPAY_ACCEPT_NEW_PAYMENTS=false` to pause new attempts while preserving idempotency recovery, status, callback and sweep processing; keep `MOCK_CHECKOUT_ENABLED=true` until pending payments are reconciled before any code rollback; retain the additive columns and history. Tools and setup are documented in [agent-setup.md](agent-setup.md).
