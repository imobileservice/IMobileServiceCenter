-- ============================================================
-- SUPPLIER SHOPS: CATEGORY ACCESS + SELF-SERVICE ORDERING
-- ============================================================
--
-- Changes what /supplier is for. It used to ask vendors "can you send us these?";
-- it now serves the shops WE supply. A shop signs in, sees only the categories
-- the admin opened up to them, sees nothing but whether each item is in stock,
-- and places an order without phoning anyone. The order lands in the admin panel.
--
-- Deliberately additive: inv_supplier_products and inv_supplier_responses are
-- left alone so nothing that still reads them breaks, and so a rollback is just
-- pointing the app back at the old screens.
--
-- Safe to run more than once.

BEGIN;

-- 1. Who the shop talks to ------------------------------------------------
-- The portal's WhatsApp and Call buttons dial these. Per shop rather than one
-- global number so a shop can be pointed at whichever rep handles them; the
-- server falls back to the site-wide number when they are blank.
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS support_phone TEXT;
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS support_whatsapp TEXT;

-- 2. Which categories a shop may see --------------------------------------
-- No row for a shop means no catalogue at all. That is the safe default: a new
-- shop sees nothing until someone deliberately opens a category, rather than
-- the entire product list the moment their login is created.
CREATE TABLE IF NOT EXISTS inv_supplier_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES inv_suppliers(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier_categories_supplier
  ON inv_supplier_categories(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_categories_category
  ON inv_supplier_categories(category_id);

-- 3. Orders placed from the portal ----------------------------------------
CREATE SEQUENCE IF NOT EXISTS inv_supplier_order_seq;

CREATE TABLE IF NOT EXISTS inv_supplier_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE
                 DEFAULT ('SO-' || to_char(now(), 'YYMMDD') || '-' ||
                          lpad(nextval('inv_supplier_order_seq')::TEXT, 4, '0')),
  supplier_id  UUID NOT NULL REFERENCES inv_suppliers(id) ON DELETE CASCADE,
  -- Copied at order time so the record still reads correctly if the shop is
  -- later renamed or removed.
  supplier_name TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  item_count   INTEGER NOT NULL DEFAULT 0,
  total_qty    INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  contact_phone TEXT,
  admin_note   TEXT,
  handled_by   TEXT,
  handled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inv_supplier_orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'ready', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier_orders_supplier
  ON inv_supplier_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_orders_status
  ON inv_supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_orders_created
  ON inv_supplier_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS inv_supplier_order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES inv_supplier_orders(id) ON DELETE CASCADE,
  -- SET NULL rather than CASCADE: deleting a product must not quietly rewrite
  -- what a shop ordered. product_name and barcode below keep the line readable.
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  barcode      TEXT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  -- Stock at the moment of ordering, so a later sale does not make the order
  -- look as though it was placed against an empty shelf.
  was_in_stock BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier_order_items_order
  ON inv_supplier_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_order_items_product
  ON inv_supplier_order_items(product_id);

-- 4. Keep updated_at honest ------------------------------------------------
CREATE OR REPLACE FUNCTION touch_inv_supplier_orders()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_inv_supplier_orders ON inv_supplier_orders;
CREATE TRIGGER trg_touch_inv_supplier_orders
  BEFORE UPDATE ON inv_supplier_orders
  FOR EACH ROW
  EXECUTE FUNCTION touch_inv_supplier_orders();

-- 5. Lock the new tables down ---------------------------------------------
-- RLS on with no policies, like the rest of the inv_* tables: the anon key in
-- the frontend can read nothing here. Every read and write goes through the
-- server on the service-role key, which pins the shop id to their session - a
-- shop must never be able to name another shop's id.
ALTER TABLE inv_supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_supplier_order_items ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify:
--   SELECT name, support_phone, support_whatsapp FROM inv_suppliers ORDER BY name;
--   SELECT COUNT(*) FROM inv_supplier_categories;
--   SELECT order_number, supplier_name, status, total_qty FROM inv_supplier_orders ORDER BY created_at DESC LIMIT 10;
