# Hashan Kavishka catalogue access

Hashan Kavishka's Meegoda cashier account (`42b6d07b-9846-46e9-a980-7d2af29fca94`) can access only these existing categories:

- Display (`3ab1fd08-7201-4629-89eb-f92efb3465d0`)
- On Off Ribbon (`560cac39-50ad-411d-9575-59292eb052c4`)

The configuration is in `src/config/cashier-catalog-access.ts`. It matches the account ID, cashier role and Meegoda branch. Other cashier accounts and administrators retain their existing access. Future RCB or Motherboard categories are not automatically permitted.

The server verifies the live till session before applying access to product lists, searches, barcode scans, product details, checkout, returns, order history and daily summaries. Invoices containing any product outside the allowed categories are hidden in full, so displayed invoice totals are not misleading. Website Terminal remains unavailable to this cashier.

Supplier Orders remains visible. Hashan can view, print, create and advance orders containing only Display and On Off Ribbon products. Mixed orders and orders containing other categories are hidden, including from the counters. Creating an order with a forbidden product or updating a hidden order is refused by the API. Supplier management, cancellation and deletion retain their existing owner-only access.

Inventory endpoints containing product data now require a valid panel or till session even when `INVENTORY_API_STRICT` is disabled. Delivery PDFs require a panel session or an eligible till session. Cashier pages use their till identity even if the browser also retains a panel login.

Deploy the frontend and API together, then refresh the cashier page. No database migration is required. Verify with `npm run verify:cashier-catalog`; the script uses isolated fixtures and performs no live database writes.
