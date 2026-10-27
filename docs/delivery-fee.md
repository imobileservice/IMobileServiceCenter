# Default delivery fee

Go to **Admin → Settings → Delivery Fee**, enter the amount in rupees, and click **Save Delivery Fee**. Zero is allowed; negative amounts and more than two decimal places are rejected.

The saved fee applies to all new delivery orders, including orders above Rs. 15,000. Until an administrator saves a value, the default is Rs. 500.00. Cart and checkout totals show the configured fee. Choosing **Visit Shop & Pay** sets it to Rs. 0.00.

In the cashier POS, selecting a saved customer or shop starts with the admin's default delivery fee. The cashier can edit the fee in the customer section for the current sale, including setting it to zero, or click **Use admin default**. Each new customer selection starts from the current default. Cashier changes do not change the admin setting. Clearing the selection and using the separate walk-in form sets it to Rs. 0.00. The fee appears in the POS summary, original receipt, and reprints. Existing receipts retain their recorded totals.

Checkout verifies the latest fee on the server and stores it in the order's existing `shipping` field, together with the calculated `total`. If the fee changes during checkout, the customer must review the updated total before retrying. Reprints and invoices use the saved order amounts, so later settings changes do not alter existing bills.

The setting uses the existing `admin_settings` table (`key = delivery_fee`). For POS support, run `supabase/migrations/add_pos_delivery_fee.sql` in the project's Supabase SQL Editor before deploying the frontend and API changes. It adds the saved fee and shop reference to `inv_sales` and a transactional wrapper around the existing `process_sale` function. Sale creation, stock deduction, and the fee update either all succeed or all roll back. It does not change historical sale totals. The existing till-session and sold-as-model migrations must already be installed.

Run `npm run verify:delivery-fee` for isolated billing, settings, access, receipt, and PDF checks. The test intercepts database requests and stubs email sending, so it does not create real orders or send messages.

The SQL transaction check is `scripts/verify-pos-delivery-fee.sql`. Run it only in a fresh disposable local database named `pos_delivery_fee_test`. It loads the existing sale function and the new migration, then checks saved totals, walk-in zero, stock deduction, sold-as names, and complete rollback when the final fee update fails.
