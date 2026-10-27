# POS fees and returns

In POS, choose a saved customer/shop and edit **Delivery fee (Rs.)** in the customer section as needed. The initial amount comes from Admin Settings. Changes apply to this sale; the next customer starts with the admin default. Walk-in sales have no delivery fee.

When processing a return, select the exact sale line, quantity, and **Good** or **Bad / Damaged** condition. Good returns restore sellable stock at the branch where the sale was made. Bad returns only increase `damaged_quantity`; they never increase sellable stock. Admin and cashier sale history show the return condition, quantity, date and refund. Previously returned quantities reduce the remaining returnable amount.

Refunds include the merchandise's share of the sale discount and tax. Delivery fees remain charged. Completed returns and stock updates are transactional, and simultaneous returns on the same invoice are serialized to prevent returning more units than were sold.

In **Admin > Inventory Management**, **Good Stock** shows sellable units and **Bad Products** shows damaged units. Click the bad count for a searchable card list (four columns on desktop, two on tablet, one on mobile).

## Required database update

Open **`supabase/RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql`**, copy its entire contents, replace the entire query in Supabase SQL Editor, and click **Run** before deploying these frontend/API changes. This file bundles the delivery-fee and return-tracking migrations in one transaction and can be rerun. The existing POS sale and good/damaged stock schema must already be installed. It only alters existing tables/functions and preserves table RLS; it creates no test products, sales or users.

**Do not paste anything from `scripts/verify-*.sql` into Supabase SQL Editor.** Those files are fixtures for disposable local databases and include psql-specific commands.

Validation: `npm run verify:delivery-fee` covers default/custom fees, persistence, and receipts; `npx tsx scripts/verify-pos-returns.ts` covers return summaries and rendering. The PostgreSQL integration fixture is `scripts/verify-pos-returns.sql`, for a fresh disposable local database named `pos_delivery_fee_test` only.
