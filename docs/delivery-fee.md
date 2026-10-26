# Default delivery fee

Go to **Admin → Settings → Delivery Fee**, enter the amount in rupees, and click **Save Delivery Fee**. Zero is allowed; negative amounts and more than two decimal places are rejected.

The saved fee applies to all new delivery orders, including orders above Rs. 15,000. Until an administrator saves a value, the default is Rs. 500.00. Cart and checkout totals show the configured fee. Choosing **Visit Shop & Pay** sets it to Rs. 0.00. Counter POS receipts also show Rs. 0.00.

Checkout verifies the latest fee on the server and stores it in the order's existing `shipping` field, together with the calculated `total`. If the fee changes during checkout, the customer must review the updated total before retrying. Reprints and invoices use the saved order amounts, so later settings changes do not alter existing bills.

The setting uses the existing `admin_settings` table (`key = delivery_fee`); no new database columns or migration are needed. Deploy both the frontend and API changes together.

Run `npm run verify:delivery-fee` for isolated billing, settings, access, receipt, and PDF checks. The test intercepts database requests and stubs email sending, so it does not create real orders or send messages.
