-- ============================================================
-- SUPPLIER TOWN + ORDERS PLACED AT THE COUNTER
-- ============================================================
--
-- Two small additions, both driven by the same job: a cashier standing at the
-- till can now place an order for one of the shops we supply, and print a slip
-- that says who it is for and where it goes.
--
-- 1. Shops get a town of their own. `address` already existed but holds a full
--    street address, which is too long for an 80mm slip and is not what anyone
--    reads off it - the town is how the delivery run is sorted.
--
-- 2. Orders carry the town and the cashier who placed them. Both are copied
--    onto the order rather than joined at print time, matching supplier_name,
--    which is already copied "so the record still reads correctly if the shop is
--    later renamed or removed". Reprinting a six-month-old slip should show
--    where it went then, not where the shop has since moved to.
--
-- Safe to run more than once. Additive only - nothing that reads these tables
-- today needs to change, and the server tolerates a database without the new
-- columns so this can be deployed before or after the app.

BEGIN;

ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS town TEXT;

ALTER TABLE inv_supplier_orders ADD COLUMN IF NOT EXISTS supplier_town TEXT;

-- Blank for every order the portal placed; only counter orders name a cashier.
-- That is also how the two are told apart in the UI.
ALTER TABLE inv_supplier_orders ADD COLUMN IF NOT EXISTS placed_by TEXT;

COMMIT;

-- Optional, run once if you want existing shops to start with a town guessed
-- from the tail of their address. Check the results before relying on them.
--
--   UPDATE inv_suppliers
--      SET town = btrim(split_part(address, ',', array_length(string_to_array(address, ','), 1)))
--    WHERE town IS NULL AND address IS NOT NULL AND btrim(address) <> '';
