-- Store one-time POS customer phone numbers and fix branch stock restoration on returns.

ALTER TABLE inv_sales ADD COLUMN IF NOT EXISTS customer_phone TEXT;

DO $$
BEGIN
  ALTER TYPE inv_stock_movement_type ADD VALUE 'return_good';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE inv_stock_movement_type ADD VALUE 'return_damaged';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE inv_stock
  ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0);

DROP FUNCTION IF EXISTS process_sale(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT);

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
  p_shop TEXT DEFAULT 'Meegoda'
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
BEGIN
  v_invoice := generate_invoice_number();

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
    source, notes, created_by, shop
  ) VALUES (
    v_invoice, p_customer_id, p_customer_name, p_customer_phone, v_total,
    p_discount, p_tax, v_net, p_payment_method::inv_payment_method,
    p_source::inv_sale_source, p_notes, p_created_by, p_shop
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::NUMERIC;
    v_item_total := v_quantity * v_price;

    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;

    INSERT INTO inv_sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (v_sale_id, v_product_id, v_product_name, v_quantity, v_price, v_item_total);

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

    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (v_product_id, 'sale', -v_quantity, v_sale_id, 'POS Sale (' || p_shop || '): ' || v_invoice, p_created_by);
  END LOOP;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'total_amount', v_total,
    'discount_amount', p_discount,
    'tax_amount', p_tax,
    'net_amount', v_net,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_return(
  p_invoice_number TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_condition TEXT,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_sale_shop TEXT;
  v_item_id UUID;
  v_unit_price NUMERIC;
  v_sold_quantity INTEGER;
  v_returned_quantity INTEGER := 0;
  v_returnable_quantity INTEGER;
  v_refund_amount NUMERIC;
  v_stock_movement_type inv_stock_movement_type;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than 0';
  END IF;

  IF p_condition NOT IN ('good', 'damaged') THEN
    RAISE EXCEPTION 'Condition must be "good" or "damaged"';
  END IF;

  SELECT id, COALESCE(shop, 'Meegoda') INTO v_sale_id, v_sale_shop
  FROM inv_sales
  WHERE invoice_number = p_invoice_number;

  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_number;
  END IF;

  SELECT id, unit_price, quantity INTO v_item_id, v_unit_price, v_sold_quantity
  FROM inv_sale_items
  WHERE sale_id = v_sale_id AND product_id = p_product_id
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Product % not found in invoice %', p_product_id, p_invoice_number;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_returned_quantity
  FROM inv_stock_movements
  WHERE reference_id = v_sale_id
    AND product_id = p_product_id
    AND type::TEXT IN ('return_good', 'return_damaged');

  v_returnable_quantity := v_sold_quantity - v_returned_quantity;

  IF p_quantity > v_returnable_quantity THEN
    RAISE EXCEPTION 'Return quantity exceeds remaining returnable quantity. Remaining: %', v_returnable_quantity;
  END IF;

  v_refund_amount := v_unit_price * p_quantity;

  IF p_condition = 'good' THEN
    IF v_sale_shop = 'Padukka' THEN
      UPDATE inv_stock
      SET qty_padukka = COALESCE(qty_padukka, 0) + p_quantity,
          quantity = COALESCE(quantity, 0) + p_quantity,
          updated_at = now()
      WHERE product_id = p_product_id;
    ELSIF v_sale_shop = 'Padukka new' THEN
      UPDATE inv_stock
      SET qty_padukka_new = COALESCE(qty_padukka_new, 0) + p_quantity,
          quantity = COALESCE(quantity, 0) + p_quantity,
          updated_at = now()
      WHERE product_id = p_product_id;
    ELSE
      UPDATE inv_stock
      SET qty_meegoda = COALESCE(qty_meegoda, 0) + p_quantity,
          quantity = COALESCE(quantity, 0) + p_quantity,
          updated_at = now()
      WHERE product_id = p_product_id;
    END IF;

    v_stock_movement_type := 'return_good';
  ELSE
    UPDATE inv_stock
    SET damaged_quantity = COALESCE(damaged_quantity, 0) + p_quantity,
        updated_at = now()
    WHERE product_id = p_product_id;

    v_stock_movement_type := 'return_damaged';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % has no stock record', p_product_id;
  END IF;

  INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
  VALUES (
    p_product_id,
    v_stock_movement_type,
    p_quantity,
    v_sale_id,
    COALESCE(p_notes, 'Return from invoice ' || p_invoice_number || ' (' || p_condition || ')'),
    p_created_by
  );

  UPDATE inv_sales
  SET
    total_amount = GREATEST(0, total_amount - v_refund_amount),
    net_amount = GREATEST(0, net_amount - v_refund_amount),
    notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Refunded ' || p_quantity || 'x product ' || p_product_id)
  WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_refund_amount,
    'condition', p_condition,
    'shop', v_sale_shop,
    'remaining_returnable_quantity', v_returnable_quantity - p_quantity
  );
END;
$$ LANGUAGE plpgsql;
