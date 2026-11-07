> Deployed app update (7 November 2026): Production `dpl_EcvLQtav2nqZLGShSgk4GEZbkNtE` is READY. Demo submission/retry logs and removal of timed auto-success are verified through the signed Shopify proxy; Royal Express backend totals are included. All acceptance attempts were cancelled. No theme upload, migration, environment change or Git staging occurred. Required authenticated Vercel MCP, Context7, Vercel deployment/CLI/Functions skills, Node/npm and isolated Playwright setup remain documented below and in the [release record](mock-checkout-deployment.md). No new plugin/dependency is required. This deployment supersedes earlier app source-only statements; frontend deployment remains separate.

# Show checkout activity during a demo

This local source change adds a readable Vercel runtime log entry after a new checkout/payment attempt is committed. It is not deployed automatically.

## Open the demo log

1. After the updated companion app has been deployed, sign into the COCO Vercel account and open the **shopify-app-proxy** project.
2. Open **Logs** from the project sidebar.
3. Select the environment/deployment used by the demo, keep **Info** messages visible, and search for `[COCO DEMO]`. Adjust the time range to include the demo.
4. Submit a checkout in the storefront. Open the matching log row to read the message.

```text
[COCO DEMO] Checkout submitted | 7 Nov 2026, 18:30:00 UTC+07:00 | Waffle Henley Shirt / Gray / M × 1 | 68,000 MMK | MMQR | COCO-MOCK-12345678
```

The time comes from the saved payment attempt's creation timestamp, formatted in `Asia/Bangkok` (UTC+07:00). Vercel's own timestamp column may use a different display timezone. Multiple items appear on the same line separated by semicolons. Product titles include their saved variant information, and whitespace/newlines are normalized.

A payment retry produces **Payment retry submitted** with its new attempt time and the original checkout reference and frozen total. These messages confirm submission, not successful payment. The 10-second demo auto-success remains disabled.

Quotes, status polls, reload recovery, cancellation, expiry and repeat submissions using the same idempotency key do not produce demo entries. The application calls `console.info` only for the existing `fresh` attempt result, after the transaction commits and before payment initialization. Logging failure does not interrupt checkout. Ordinary runtime logging is best effort rather than a durable audit/history feature; log retention follows the Vercel plan. A process failure immediately after commit can leave a saved attempt without a log entry.

Only saved product titles, quantities, total/currency, payment method, checkout reference and attempt time are included. Customer contact/address fields, capabilities, idempotency keys, gateway credentials, provider identifiers, payment URLs and QR payloads are excluded. No new public API, database table, environment variable or npm dependency is introduced.

## Tooling and verification

- Use existing Node/npm dependencies (`npm ci` if needed), then `npm test`, `npm run typecheck`, and `npm run lint` in the companion app. Tests capture log output locally, exercise concurrent/idempotent requests, retries, multiple items, whitespace normalization, Bangkok date-boundary formatting, rejected requests, polling and unavailable logging.
- Context7 MCP supplies current official Vercel documentation. Configure `https://mcp.context7.com/mcp` in the agent client and resolve the official Vercel library before querying. No Context7 runtime dependency is used by the app.
- Use the installed Vercel plugin's `vercel:vercel-functions` skill for runtime logging guidance. Install/connect the Vercel plugin through the agent client; the dashboard requires access to the COCO project. Vercel MCP/CLI is optional for separately authorized runtime-log inspection or deployment, not needed for local tests or emitting `console.info`.
- Existing installation/account setup is in [agent-setup.md](agent-setup.md). No additional plugin or MCP server is required. Do not start a dev server, deploy or alter Git staging as part of this source change.

Official reference: [Vercel runtime logs](https://vercel.com/docs/logs/runtime).
