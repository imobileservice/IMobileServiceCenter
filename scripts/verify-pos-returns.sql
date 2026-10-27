-- LOCAL TEST ONLY. Do not paste this test fixture into Supabase SQL Editor.
-- Run with psql in a fresh disposable database named pos_delivery_fee_test.
\set ON_ERROR_STOP on
\ir verify-pos-delivery-fee.sql
\ir ../supabase/migrations/add_pos_return_tracking.sql
\ir ../supabase/migrations/add_pos_return_tracking.sql

DO $$
DECLARE
  v_product UUID := '00000000-0000-0000-0000-000000000001';
  v_sale JSONB;
  v_item UUID;
  v_invoice TEXT;
  v_result JSONB;
  v_before INTEGER;
  v_count INTEGER;
  v_subtotal NUMERIC;
BEGIN
  UPDATE inv_stock SET quantity = 100, qty_meegoda = 100, qty_padukka = 10, qty_padukka_new = 10, damaged_quantity = 0;
  v_sale := process_sale_with_delivery(p_customer_id := '00000000-0000-0000-0000-000000000003', p_delivery_fee := 50,
    p_discount := 30, p_tax := 15, p_shop := 'Padukka',
    p_items := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'price', 100)));
  v_invoice := v_sale->>'invoice_number';
  SELECT id INTO v_item FROM inv_sale_items WHERE sale_id = (v_sale->>'sale_id')::UUID;
  ASSERT (SELECT qty_padukka FROM inv_stock WHERE product_id = v_product) = 7;
  v_result := process_return_item(v_invoice, v_product, 1, 'good', p_sale_item_id := v_item);
  ASSERT (v_result->>'refund_amount')::NUMERIC = 95;
  ASSERT (SELECT qty_padukka FROM inv_stock WHERE product_id = v_product) = 8;
  ASSERT (SELECT qty_meegoda FROM inv_stock WHERE product_id = v_product) = 100;
  ASSERT (SELECT quantity FROM inv_stock WHERE product_id = v_product) = 98;
  ASSERT (SELECT damaged_quantity FROM inv_stock WHERE product_id = v_product) = 0;
  v_result := process_return_item(v_invoice, v_product, 1, 'damaged', p_sale_item_id := v_item);
  ASSERT (SELECT qty_padukka FROM inv_stock WHERE product_id = v_product) = 8;
  ASSERT (SELECT quantity FROM inv_stock WHERE product_id = v_product) = 98;
  ASSERT (SELECT damaged_quantity FROM inv_stock WHERE product_id = v_product) = 1;
  SELECT count(*) INTO v_count FROM inv_stock_movements WHERE reference_id = (v_sale->>'sale_id')::UUID;
  BEGIN
    PERFORM process_return_item(v_invoice, v_product, 2, 'good', p_sale_item_id := v_item);
    RAISE EXCEPTION 'Test accepted an excessive return';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Return quantity exceeds%' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM inv_stock_movements WHERE reference_id = (v_sale->>'sale_id')::UUID) = v_count;
  ASSERT (SELECT quantity FROM inv_stock WHERE product_id = v_product) = 98;
  PERFORM process_return_item(v_invoice, v_product, 1, 'good', p_sale_item_id := v_item);
  ASSERT (SELECT net_amount FROM inv_sales WHERE invoice_number = v_invoice) = 50, 'Delivery must remain charged';
  ASSERT (SELECT total_amount FROM inv_sales WHERE invoice_number = v_invoice) = 0;
  ASSERT (SELECT SUM(quantity) FROM inv_stock_movements WHERE reference_id = (v_sale->>'sale_id')::UUID AND type = 'return_good') = 2;
  ASSERT (SELECT SUM(quantity) FROM inv_stock_movements WHERE reference_id = (v_sale->>'sale_id')::UUID AND type = 'return_damaged') = 1;

  -- Two lines can reference one product at different prices. Return the exact selected line.
  v_sale := process_sale(p_items := jsonb_build_array(
    jsonb_build_object('product_id', v_product, 'quantity', 1, 'price', 100),
    jsonb_build_object('product_id', v_product, 'quantity', 1, 'price', 250)));
  v_invoice := v_sale->>'invoice_number';
  SELECT id INTO v_item FROM inv_sale_items WHERE sale_id = (v_sale->>'sale_id')::UUID AND unit_price = 250;
  v_result := process_return_item(v_invoice, v_product, 1, 'damaged', p_sale_item_id := v_item);
  ASSERT (v_result->>'refund_amount')::NUMERIC = 250;
  ASSERT (SELECT net_amount FROM inv_sales WHERE invoice_number = v_invoice) = 100;
  PERFORM process_return(v_invoice, v_product, 1, 'good');
  ASSERT (SELECT net_amount FROM inv_sales WHERE invoice_number = v_invoice) = 0;
  RAISE NOTICE 'PASS: exact line returns, good restocking by branch, bad stock separated, repeat protection, refund history, discounts/tax and delivery retained';
END $$;
