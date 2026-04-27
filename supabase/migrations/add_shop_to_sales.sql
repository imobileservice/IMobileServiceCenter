-- ============================================================
-- Add shop column to inv_sales table
-- ============================================================

ALTER TABLE inv_sales ADD COLUMN IF NOT EXISTS shop TEXT DEFAULT 'Meegoda';

-- Update the process_sale function to insert the shop into inv_sales
CREATE OR REPLACE FUNCTION process_sale(
  p_customer_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'Walk-in Customer',
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
  -- Generate invoice number
  v_invoice := generate_invoice_number();
  
  -- Calculate total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::NUMERIC;
    v_item_total := v_quantity * v_price;
    v_total := v_total + v_item_total;
    
    -- Check stock availability for the specific shop
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
  
  -- Calculate net amount
  v_net := v_total - p_discount + p_tax;
  
  -- Insert sale record
  INSERT INTO inv_sales (
    invoice_number, customer_id, customer_name, total_amount, 
    discount_amount, tax_amount, net_amount, payment_method, 
    source, notes, created_by, shop
  ) VALUES (
    v_invoice, p_customer_id, p_customer_name, v_total,
    p_discount, p_tax, v_net, p_payment_method::inv_payment_method,
    p_source::inv_sale_source, p_notes, p_created_by, p_shop
  ) RETURNING id INTO v_sale_id;
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::NUMERIC;
    v_item_total := v_quantity * v_price;
    
    -- Get product name
    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
    
    -- Insert sale item
    INSERT INTO inv_sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (v_sale_id, v_product_id, v_product_name, v_quantity, v_price, v_item_total);
    
    -- Decrease stock for the specific shop
    IF p_shop = 'Padukka' THEN
        UPDATE inv_stock SET qty_padukka = qty_padukka - v_quantity, updated_at = now() WHERE product_id = v_product_id;
    ELSIF p_shop = 'Padukka new' THEN
        UPDATE inv_stock SET qty_padukka_new = qty_padukka_new - v_quantity, updated_at = now() WHERE product_id = v_product_id;
    ELSE
        UPDATE inv_stock SET qty_meegoda = qty_meegoda - v_quantity, updated_at = now() WHERE product_id = v_product_id;
    END IF;
    
    -- Record movement
    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (v_product_id, 'sale', -v_quantity, v_sale_id, 'POS Sale (' || p_shop || '): ' || v_invoice, p_created_by);
  END LOOP;
  
  -- Return the result
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
