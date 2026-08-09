-- ============================================================
-- ONE DEFAULT CATEGORY LIST FOR ALL SHOPS
-- ============================================================
--
-- 20260809_supplier_shop_orders.sql gave every shop its own category list,
-- which means adding a category to the catalogue is a job you have to repeat
-- once per shop. This adds a single default list that shops follow unless they
-- have been given their own.
--
-- A shop is in one of two modes:
--   'default' - sees inv_supplier_default_categories (the shared list)
--   'custom'  - sees inv_supplier_categories for that shop only
--
-- Depends on 20260809_supplier_shop_orders.sql. Safe to run more than once.

BEGIN;

-- 1. Which list a shop follows -------------------------------------------
-- A mode column rather than "has rows = custom": a shop deliberately given an
-- empty list of its own is a real state, and inferring from row count would
-- silently hand it the whole default list instead.
ALTER TABLE inv_suppliers
  ADD COLUMN IF NOT EXISTS category_access_mode TEXT NOT NULL DEFAULT 'default';

DO $$
BEGIN
  ALTER TABLE inv_suppliers
    ADD CONSTRAINT inv_suppliers_category_access_mode_check
    CHECK (category_access_mode IN ('default', 'custom'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. The shared list -------------------------------------------------------
-- One row per category, no supplier column: this IS the default.
CREATE TABLE IF NOT EXISTS inv_supplier_default_categories (
  category_id UUID PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Leave existing shops exactly as they are ------------------------------
-- Anyone who already had a hand-picked list keeps seeing precisely that. The
-- default list starts empty, so flipping them to it would blank their
-- catalogue - the one outcome this migration must not cause.
UPDATE inv_suppliers
SET category_access_mode = 'custom'
WHERE category_access_mode = 'default'
  AND id IN (SELECT DISTINCT supplier_id FROM inv_supplier_categories);

-- 4. Lock it down ----------------------------------------------------------
-- RLS on with no policies, like the rest of the inv_* tables: reachable only
-- through the server on the service-role key.
ALTER TABLE inv_supplier_default_categories ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify:
--   SELECT name, category_access_mode FROM inv_suppliers ORDER BY name;
--   SELECT c.name FROM inv_supplier_default_categories d JOIN categories c ON c.id = d.category_id ORDER BY c.name;
