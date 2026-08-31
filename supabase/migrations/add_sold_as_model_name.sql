-- Sell one physical product under the customer's phone model name.
--
-- The shop has 10 "Samsung M02 Display". The same 10 also fit A02, M02s, A02s.
-- A customer with an A02 must see "Samsung A02 Display" on his bill - but the
-- shop must still hold ONE pool of 10, not five pools of 10.
--
-- The name on a sale line is only a text snapshot: nothing about stock, returns
-- or reporting reads it (those all use product_id). So the customer-facing name
-- can differ from the product name with no effect on inventory whatsoever.
--
-- Today process_sale overwrites whatever name the till sends:
--     SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
-- which is why the bill can currently only ever say "M02 Display".
--
-- This migration lets each item in p_items carry an optional `sold_as` name and
-- an optional `phone_model_id`. Callers that send neither behave EXACTLY as
-- before, so nothing existing changes.
--
-- IMPORTANT: this rewrites the CURRENT 12-argument process_sale defined in
-- add_pos_till_sessions.sql (customer_phone + pos_session_id + till binding),
-- NOT the older 10-argument version in multi_shop_inventory.sql. Using the old
-- signature here would create a second overload that the app never calls.
--
-- Requires: add_phone_model_compatibility.sql, add_pos_till_sessions.sql
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.phone_models') IS NULL THEN
    RAISE EXCEPTION 'Run supabase/migrations/add_phone_model_compatibility.sql first';
  END IF;
  IF to_regclass('public.pos_till_sessions') IS NULL THEN
    RAISE EXCEPTION 'Run supabase/migrations/add_pos_till_sessions.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Remember which phone the item was sold for
-- ---------------------------------------------------------------------------
-- Nullable, ON DELETE SET NULL: a sale line must never be lost because a phone
-- model was later removed. Reporting only - stock never reads this column.
ALTER TABLE inv_sale_items
  ADD COLUMN IF NOT EXISTS phone_model_id UUID REFERENCES phone_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_sale_items_phone_model
  ON inv_sale_items (phone_model_id)
  WHERE phone_model_id IS NOT NULL;

-- Website orders keep their line names in order_items.product_name, which the
-- app already controls, so they need no schema change.

-- ---------------------------------------------------------------------------
-- 2. process_sale - byte-identical to add_pos_till_sessions.sql except that an
--    item may now carry `sold_as` and `phone_model_id`.
-- ---------------------------------------------------------------------------
-- Stock deduction, till binding, movement rows and the returned JSON are all
-- untouched.
CREATE OR REPLACE FUNCTION process_sale(
  p_customer_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'Walk-in Customer',
  p_customer_phone TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_source TEXT DEFAULT 'pos',
  p_discount NUMERIC DEFAULT 0,
  p_tax NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system',
  p_items JSONB DEFAULT '[]'::JSONB,
  p_shop TEXT DEFAULT 'Meegoda',
  p_pos_session_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_invoice TEXT;
  v_total NUMERIC := 0;
  v_net NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_price NUMERIC;
  v_item_total NUMERIC;
  v_current_shop_stock INTEGER;
  v_product_name TEXT;
  v_till_id UUID;
  v_till_code TEXT;
  v_sold_as TEXT;
  v_phone_model_id UUID;
BEGIN
  v_invoice := generate_invoice_number();

  IF p_pos_session_id IS NOT NULL THEN
    SELECT s.till_id, t.code_hint
      INTO v_till_id, v_till_code
    FROM pos_till_sessions s
    JOIN pos_tills t ON t.id = s.till_id
    WHERE s.id = p_pos_session_id
      AND s.status = 'open'
      AND s.expires_at > now();

    IF v_till_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or closed POS till session';
    END IF;

    UPDATE pos_till_sessions
    SET last_seen_at = now()
    WHERE id = p_pos_session_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::NUMERIC;
    v_item_total := v_quantity * v_price;
    v_total := v_total + v_item_total;

    IF p_shop = 'Padukka' THEN
      SELECT qty_padukka INTO v_current_shop_stock FROM inv_stock WHERE product_id = v_product_id FOR UPDATE;
    ELSIF p_shop = 'Padukka new' THEN
      SELECT qty_padukka_new INTO v_current_shop_stock FROM inv_stock WHERE product_id = v_product_id FOR UPDATE;
    ELSE
      SELECT qty_meegoda INTO v_current_shop_stock FROM inv_stock WHERE product_id = v_product_id FOR UPDATE;
    END IF;

    IF v_current_shop_stock IS NULL THEN
      RAISE EXCEPTION 'Product % has no stock record', v_product_id;
    END IF;

    IF v_current_shop_stock < v_quantity THEN
      SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
      RAISE EXCEPTION 'Insufficient stock in % for "%". Available: %, Requested: %',
        p_shop, COALESCE(v_product_name, v_product_id::TEXT), v_current_shop_stock, v_quantity;
    END IF;
  END LOOP;

  v_net := v_total - p_discount + p_tax;

  INSERT INTO inv_sales (
    invoice_number, customer_id, customer_name, customer_phone, total_amount,
    discount_amount, tax_amount, net_amount, payment_method,
    source, notes, created_by, shop, pos_session_id, till_id, till_code
  ) VALUES (
    v_invoice, p_customer_id, p_customer_name, p_customer_phone, v_total,
    p_discount, p_tax, v_net, p_payment_method::inv_payment_method,
    p_source::inv_sale_source, p_notes, p_created_by, p_shop, p_pos_session_id, v_till_id, v_till_code
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::NUMERIC;
    v_item_total := v_quantity * v_price;

    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;

    -- NEW: the till may name the line after the customer's own phone. This is
    -- the printed name only - product_id below is still the real product, so
    -- stock, returns and reports are unaffected.
    v_sold_as := NULLIF(TRIM(COALESCE(v_item->>'sold_as', '')), '');
    IF v_sold_as IS NOT NULL THEN
      v_product_name := v_sold_as;
    END IF;

    -- NEW: which phone this was sold for (reporting only, never stock).
    -- A malformed id is ignored rather than failing the whole sale.
    BEGIN
      v_phone_model_id := NULLIF(TRIM(COALESCE(v_item->>'phone_model_id', '')), '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      v_phone_model_id := NULL;
    END;

    INSERT INTO inv_sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price, phone_model_id)
    VALUES (v_sale_id, v_product_id, v_product_name, v_quantity, v_price, v_item_total, v_phone_model_id);

    IF p_shop = 'Padukka' THEN
      UPDATE inv_stock
      SET qty_padukka = COALESCE(qty_padukka, 0) - v_quantity,
          quantity = GREATEST(0, COALESCE(quantity, 0) - v_quantity),
          updated_at = now()
      WHERE product_id = v_product_id;
    ELSIF p_shop = 'Padukka new' THEN
      UPDATE inv_stock
      SET qty_padukka_new = COALESCE(qty_padukka_new, 0) - v_quantity,
          quantity = GREATEST(0, COALESCE(quantity, 0) - v_quantity),
          updated_at = now()
      WHERE product_id = v_product_id;
    ELSE
      UPDATE inv_stock
      SET qty_meegoda = COALESCE(qty_meegoda, 0) - v_quantity,
          quantity = GREATEST(0, COALESCE(quantity, 0) - v_quantity),
          updated_at = now()
      WHERE product_id = v_product_id;
    END IF;

    -- The stock ledger keeps the INTERNAL product name on purpose: the ledger
    -- must always read as the physical item, never as the phone it was sold for.
    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (
      v_product_id,
      'sale',
      -v_quantity,
      v_sale_id,
      'POS Sale (' || p_shop || COALESCE(', Till ' || v_till_code, '') || '): ' || v_invoice,
      p_created_by
    );
  END LOOP;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'total_amount', v_total,
    'discount_amount', p_discount,
    'tax_amount', p_tax,
    'net_amount', v_net,
    'items_count', jsonb_array_length(p_items),
    'pos_session_id', p_pos_session_id,
    'till_id', v_till_id,
    'till_code', v_till_code
  );
END;
$$ LANGUAGE plpgsql;
