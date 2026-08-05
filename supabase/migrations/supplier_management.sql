-- ============================================================
-- SUPPLIER MANAGEMENT
-- Adds supplier <-> product links, restock targets and a
-- multi-shop aware purchase (goods received) routine.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extra supplier fields
-- ------------------------------------------------------------
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS notes TEXT;

-- ------------------------------------------------------------
-- 2. Restock target on stock rows
--    0 / NULL means "not configured" -> the app falls back to
--    low_stock_threshold * 2.
-- ------------------------------------------------------------
ALTER TABLE inv_stock ADD COLUMN IF NOT EXISTS target_stock_level INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN inv_stock.target_stock_level IS
  'Stock level to restock up to. Needed qty = target_stock_level - quantity. 0 = auto (low_stock_threshold * 2).';

-- ------------------------------------------------------------
-- 3. Supplier <-> product catalogue
--    Which supplier can deliver which product, at what cost,
--    and in what quantity we normally order.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES inv_suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  cost_price NUMERIC(12,2),
  reorder_qty INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier_products_supplier ON inv_supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_products_product ON inv_supplier_products(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_purchases_supplier ON inv_purchases(supplier_id);

-- ------------------------------------------------------------
-- 4. Backfill links from existing purchase history so suppliers
--    that were already used keep their product list.
-- ------------------------------------------------------------
INSERT INTO inv_supplier_products (supplier_id, product_id, cost_price)
SELECT DISTINCT ON (p.supplier_id, pi.product_id)
  p.supplier_id,
  pi.product_id,
  pi.cost_price
FROM inv_purchases p
JOIN inv_purchase_items pi ON pi.purchase_id = p.id
WHERE p.supplier_id IS NOT NULL
ORDER BY p.supplier_id, pi.product_id, p.created_at DESC
ON CONFLICT (supplier_id, product_id) DO NOTHING;

-- ------------------------------------------------------------
-- 5. RLS (backend uses the service_role key, same as the rest
--    of the inv_* tables)
-- ------------------------------------------------------------
ALTER TABLE inv_supplier_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON inv_supplier_products;
CREATE POLICY "service_role_all" ON inv_supplier_products FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 6. Multi-shop aware process_purchase
--
--    The original process_purchase incremented inv_stock.quantity
--    directly, but multi_shop_inventory.sql added a BEFORE trigger
--    (update_total_quantity) that recomputes quantity from
--    qty_meegoda + qty_padukka + qty_padukka_new, which silently
--    discarded the increment. Received goods therefore never
--    reached the shelf.
--
--    This version adds the quantity to the shop column that the
--    stock was received into, so the trigger sums it correctly.
--    p_shop defaults to 'Meegoda', so existing callers that do not
--    pass it keep working.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS process_purchase(UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS process_purchase(UUID, TEXT, TEXT, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION process_purchase(
  p_supplier_id UUID DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system',
  p_items JSONB DEFAULT '[]'::JSONB,
  p_shop TEXT DEFAULT 'Meegoda'
)
RETURNS JSONB AS $$
DECLARE
  v_purchase_id UUID;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_cost NUMERIC;
  v_item_total NUMERIC;
  v_product_name TEXT;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A purchase must contain at least one item';
  END IF;

  -- Calculate total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_cost := (v_item->>'cost_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each item needs a quantity greater than zero';
    END IF;

    v_total := v_total + (v_quantity * COALESCE(v_cost, 0));
  END LOOP;

  -- Insert purchase record
  INSERT INTO inv_purchases (supplier_id, supplier_name, total_cost, notes, created_by)
  VALUES (p_supplier_id, p_supplier_name, v_total, p_notes, p_created_by)
  RETURNING id INTO v_purchase_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_cost := COALESCE((v_item->>'cost_price')::NUMERIC, 0);
    v_item_total := v_quantity * v_cost;

    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;

    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'Product % does not exist', v_product_id;
    END IF;

    INSERT INTO inv_purchase_items (purchase_id, product_id, product_name, quantity, cost_price, total_cost)
    VALUES (v_purchase_id, v_product_id, v_product_name, v_quantity, v_cost, v_item_total);

    -- Make sure a stock row exists, then add to the receiving shop.
    INSERT INTO inv_stock (product_id, low_stock_threshold)
    VALUES (v_product_id, 5)
    ON CONFLICT (product_id) DO NOTHING;

    IF p_shop = 'Padukka' THEN
      UPDATE inv_stock
      SET qty_padukka = COALESCE(qty_padukka, 0) + v_quantity, updated_at = now()
      WHERE product_id = v_product_id;
    ELSIF p_shop = 'Padukka new' THEN
      UPDATE inv_stock
      SET qty_padukka_new = COALESCE(qty_padukka_new, 0) + v_quantity, updated_at = now()
      WHERE product_id = v_product_id;
    ELSE
      UPDATE inv_stock
      SET qty_meegoda = COALESCE(qty_meegoda, 0) + v_quantity, updated_at = now()
      WHERE product_id = v_product_id;
    END IF;

    -- Keep the buying price in sync (only when a real cost was given)
    IF v_cost > 0 THEN
      UPDATE products SET cost_price = v_cost, buy_price = v_cost WHERE id = v_product_id;
    END IF;

    -- Remember where we bought it from
    IF p_supplier_id IS NOT NULL THEN
      INSERT INTO inv_supplier_products (supplier_id, product_id, cost_price)
      VALUES (p_supplier_id, v_product_id, NULLIF(v_cost, 0))
      ON CONFLICT (supplier_id, product_id)
      DO UPDATE SET
        cost_price = COALESCE(NULLIF(EXCLUDED.cost_price, 0), inv_supplier_products.cost_price),
        updated_at = now();
    END IF;

    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (
      v_product_id, 'purchase', v_quantity, v_purchase_id,
      'Purchase (' || p_shop || ') from: ' || COALESCE(p_supplier_name, 'Unknown'),
      p_created_by
    );
  END LOOP;

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'total_cost', v_total,
    'shop', p_shop,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 7. Keep updated_at fresh on supplier links
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_inv_supplier_products()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_inv_supplier_products ON inv_supplier_products;
CREATE TRIGGER trg_touch_inv_supplier_products
  BEFORE UPDATE ON inv_supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION touch_inv_supplier_products();
