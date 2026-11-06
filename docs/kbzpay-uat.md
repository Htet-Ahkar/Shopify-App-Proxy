# KBZPay UAT activation and acceptance

Simulation is deployed to the existing app backend and unpublished Dev Preview, and the additive migration is applied. See [deployment evidence](mock-checkout-deployment.md). KBZPay UAT remains inactive: no merchant credentials, bank onboarding or real-wallet acceptance has been completed. Switching to UAT needs the configuration and acceptance steps below.

## Configuration

Existing Shopify app authentication, COCO offline session, private `shopify` schema, `DATABASE_URL`, `DIRECT_URL`, `MOCK_CHECKOUT_ENABLED=true` and `MOCK_CHECKOUT_SHOP` remain required. Optional fictional quotes use `MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED=true`.

| Variable | Value/purpose |
| --- | --- |
| KBZPAY_MODE | `simulation` (default) or `uat`; anything else fails closed |
| KBZPAY_ACCEPT_NEW_PAYMENTS | Default true; false pauses new attempts while callbacks/status/recovery remain enabled |
| KBZPAY_APP_ID | UAT application ID issued by KBZPay |
| KBZPAY_MERCH_CODE | UAT merchant code issued by KBZPay; merchant must support MMQR |
| KBZPAY_APP_KEY | UAT signing secret, server-only |
| KBZPAY_GATEWAY_BASE_URL | UAT host/path only; default `https://api-uat.kbzpay.com/payment/gateway/uat` |
| KBZPAY_PWA_URL | `https://static.kbzpay.com/pgw/uat/pwa/#/` |
| KBZPAY_NOTIFY_URL | Public HTTPS app-host URL ending `/payments/kbzpay/notify`, without query/fragment |
| MOCK_PAYMENT_SWEEP_SECRET | Existing bearer secret for scheduled reconciliation |

Gateway and PWA configuration is restricted to the official UAT host/path to prevent accidental production requests. KBZPay publishes HTTP precreate/queryorder URLs and an HTTPS closeorder URL. Confirm HTTPS support with KBZPay for the assigned UAT network; if they require the documented HTTP gateway URL, explicitly set `http://api-uat.kbzpay.com/payment/gateway/uat`. Only this exact legacy HTTP UAT location is accepted; closeorder always uses HTTPS. Never substitute production credentials or hosts. The simulator's placeholder URL is intentionally unrelated to the UAT payment link.

URLs and the app key are not sufficient alone: obtain the app ID, merchant code, MMQR enablement and approved UAT wallets, confirm outbound-network/IP access and configure any merchant/PWA whitelist with KBZPay. Confirm that the callback is reachable without Vercel authentication/login/protection or redirect. Register the correct merchant/PWA origins to avoid AOP08512. No GG Fest account, secrets or infrastructure may be reused.

## Authorized release sequence

1. Review source and additive migration, confirm database backups/COCO target, then apply the migration using the project's controlled Prisma migration process. Never run `setup` or `vercel-build` casually: they apply migrations.
2. Release app and companion-theme changes to an authorized test target, keep the published theme disabled, and verify Shopify's installed proxy configuration and offline session.
3. Start with simulation. Create each payment method, confirm non-payable labels/QR decoding, reload before 10 seconds, then verify backend success and one receipt. Cancel another payment before 10 seconds and verify no later success.
4. Supply the UAT variables in the private host store and select `uat`. Check new attempts are labeled UAT; old attempts retain their original mode. Never place keys in theme settings or logs.
5. Configure the existing protected sweep schedule for unattended recovery. POST with `Authorization: Bearer <private sweep secret>`; use the existing hosting scheduler, not a browser or public query parameter.
6. Run the acceptance matrix below with approved wallets and retain redacted references/results. UAT is accepted only after real gateway/browser verification, including callback accessibility and network requirements.

## Acceptance matrix

- Desktop and mobile KBZPay: precreate, signed PWA handoff, return/reload and backend-confirmed result. Browser navigation must never approve a payment.
- Desktop/mobile MMQR: correct amount/currency, rendered/downloaded QR decodes to returned payload, test-wallet payment, UAT warning and verified receipt.
- Cancellation before payment: query/close/query confirms closure; only then retry. Repeat cancel/retry and verify no second precreate for the same idempotency key.
- Lost create response: recover using saved idempotency key; no duplicate gateway order. Lost precreate instructions stay under reconciliation until paid or safely closed.
- Lost/duplicate/delayed callbacks: query/sweep recovery, one checkout success, late success retained and correct successful-attempt receipt shown.
- Invalid signatures, wrong merchant/order/amount/currency and malformed responses never succeed or fall back to simulation. Gateway outages preserve pending state and block unsafe retry.
- Expiry and payment during cancellation: reconcile authoritative result; retry never extends the original checkout deadline. Verify no real Shopify order, email or fulfillment occurs.

## Documentation sources

Use the official [MMQR flow](https://wap.kbzpay.com/pgw/uat/api/#/en/docs/MMQR%20Payment/scenes-MMQR-payment-en), its precreate/queryorder/callback pages, [signature algorithm](https://wap.kbzpay.com/pgw/uat/api/#/en/docs/api-signature-en), and closeorder documentation. The site is a JavaScript application; protocol tables/examples are in its public versioned JavaScript assets, and callback acknowledgement is shown in `img/doc/zh/OnlinePaymentCbkResp.png` as HTTP 200 plain `success`. Context7 currently has no KBZPay library entry. GG Gaming Fest and GG-Payment-Server were read-only references; current official protocol documentation governs this implementation.
