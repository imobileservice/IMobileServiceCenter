-- 1. Add damaged_quantity to inv_stock
ALTER TABLE inv_stock ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0);

-- 2. Update inv_stock_movement_type
-- PostgreSQL requires adding enum values separately
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

-- 3. Create process_return RPC
CREATE OR REPLACE FUNCTION process_return(
  p_invoice_number TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_condition TEXT, -- 'good' or 'damaged'
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_item_id UUID;
  v_unit_price NUMERIC;
  v_refund_amount NUMERIC;
  v_stock_movement_type inv_stock_movement_type;
BEGIN
  -- Validate quantity
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than 0';
  END IF;

  -- Validate condition
  IF p_condition NOT IN ('good', 'damaged') THEN
    RAISE EXCEPTION 'Condition must be "good" or "damaged"';
  END IF;

  -- Find the sale
  SELECT id INTO v_sale_id FROM inv_sales WHERE invoice_number = p_invoice_number;
  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_number;
  END IF;

  -- Find the sale item
  SELECT id, unit_price INTO v_item_id, v_unit_price 
  FROM inv_sale_items 
  WHERE sale_id = v_sale_id AND product_id = p_product_id
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Product % not found in invoice %', p_product_id, p_invoice_number;
  END IF;

  v_refund_amount := v_unit_price * p_quantity;

  -- Update Stock
  IF p_condition = 'good' THEN
    UPDATE inv_stock SET quantity = quantity + p_quantity, updated_at = now()
    WHERE product_id = p_product_id;
    v_stock_movement_type := 'return_good';
  ELSE
    UPDATE inv_stock SET damaged_quantity = damaged_quantity + p_quantity, updated_at = now()
    WHERE product_id = p_product_id;
    v_stock_movement_type := 'return_damaged';
  END IF;

  -- Record Movement
  INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
  VALUES (
    p_product_id, 
    v_stock_movement_type, 
    p_quantity, 
    v_sale_id, 
    COALESCE(p_notes, 'Return from invoice ' || p_invoice_number || ' (' || p_condition || ')'), 
    p_created_by
  );

  -- Adjust sale total (optional based on business logic, but typically we want to reflect the refund in the net amount)
  -- For now, we will deduct the refunded amount from the sale's net_amount to keep accounting accurate.
  UPDATE inv_sales 
  SET 
    total_amount = GREATEST(0, total_amount - v_refund_amount),
    net_amount = GREATEST(0, net_amount - v_refund_amount),
    notes = COALESCE(notes, '') || E'\nRefunded ' || p_quantity || 'x product ' || p_product_id
  WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_refund_amount,
    'condition', p_condition
  );
END;
$$ LANGUAGE plpgsql;
