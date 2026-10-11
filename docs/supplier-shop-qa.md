# Supplier shop QA — 11 October 2026

The supplier portal is enabled for registered, active shops with portal access and an existing password. Each shop retains its assigned categories and its own order history. Admin shop management remains restricted to `dexlanka@gmail.com`; authenticated open tills can list shops, create counter orders, and process orders, while password access, supplier management, cancellation, and deletion remain owner-only.

Availability uses Meegoda inventory only. Padukka and Padukka New remain visible in admin inventory and do not make products available in the supplier catalog. Pending shop orders remain requests: they do not deduct inventory or produce a final invoice; fulfillment and billing remain in the existing POS flow.

## Fixes verified

- Basket product names and trade prices survive category/search changes.
- Basket totals sum integer cents, avoiding floating-point accumulation errors.
- Portal and counter orders reject fractional, invalid, negative, and excessive quantities, including duplicate lines exceeding the per-product limit.
- Counter-order stock labels and `was_in_stock` flags use Meegoda inventory.
- Product/category rejection preserves the shop session; disabled accounts and expired sessions end it.
- Invalid session expiry dates cannot grant continued access.

## Results

| Check | Result |
| --- | --- |
| `npm run verify:supplier-flow` | 51 checks passed: login, session/till validity, shop isolation, catalog filters, quantities, order totals, rollback, history and cancellation |
| `npm run verify:supplier-access` | 20 API cases passed; owner-only management and enabled supplier/cashier routes verified |
| `npm run verify:supplier-stock` | 20 stock cases and 7 trade-price calculations passed |
| `npm run verify:app-updates` | 36 refresh/deployment regression checks passed |
| `npm run build:server` | Passed |
| `npm run build` | Passed |
| Chromium, Firefox, mobile WebKit | Supplier login, basket totals across filters, submission/history/cancellation, stock refresh, two shop accounts, session restoration and expiry passed |

Browser example: `150.25 × 2 + 200.10 × 3 = Rs. 900.80`, with two products and five units, retained after changing categories.

All QA used mocked accounts and an in-memory database; no live orders, credentials, or inventory were changed. The browser preview used dummy Supabase credentials for the separate customer-auth provider. Firefox reported three lock errors for `sb-fixture-auth-token`; these were recorded separately from supplier checks. Their behavior with production credentials has not been verified.

Deploy both the website and API to enable the changes in production. A real shop login and order should then be checked against the deployed services; this QA does not confirm production account settings or database schema.
