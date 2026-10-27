-- SUPABASE SQL EDITOR: apply after add_pos_delivery_fee.sql and the existing returns migration.
-- Uses the existing stock movement ledger; creates no tables and preserves their RLS.
BEGIN;

ALTER TABLE public.inv_stock ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0);
ALTER TABLE public.inv_stock_movements
  ADD COLUMN IF NOT EXISTS sale_item_id UUID REFERENCES public.inv_sale_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS inv_return_movements_sale ON public.inv_stock_movements(reference_id, product_id);

CREATE OR REPLACE FUNCTION public.process_return_item(
  p_invoice_number TEXT, p_product_id UUID, p_quantity INTEGER, p_condition TEXT,
  p_notes TEXT DEFAULT NULL, p_created_by TEXT DEFAULT 'system', p_sale_item_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sale public.inv_sales%ROWTYPE;
  v_item RECORD;
  v_legacy INTEGER;
  v_assigned INTEGER;
  v_used INTEGER;
  v_available INTEGER;
  v_take INTEGER;
  v_left INTEGER := p_quantity;
  v_raw_refund NUMERIC := 0;
  v_refund NUMERIC;
  v_original_subtotal NUMERIC;
  v_ratio NUMERIC;
  v_remaining_sale INTEGER;
  v_type public.inv_stock_movement_type;
  v_movements UUID[] := '{}';
  v_movement_id UUID;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Return quantity must be a positive whole number'; END IF;
  IF p_condition IS NULL OR p_condition NOT IN ('good', 'damaged') THEN RAISE EXCEPTION 'Choose good or damaged condition'; END IF;

  -- Serialize returns on the same sale before checking the remaining quantities.
  SELECT * INTO v_sale FROM public.inv_sales WHERE invoice_number = p_invoice_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_number; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_legacy FROM public.inv_stock_movements
  WHERE reference_id = v_sale.id AND product_id = p_product_id
    AND type::TEXT IN ('return_good', 'return_damaged') AND sale_item_id IS NULL;

  SELECT COALESCE(SUM(unit_price * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_original_subtotal, v_remaining_sale FROM public.inv_sale_items WHERE sale_id = v_sale.id;
  SELECT v_remaining_sale - COALESCE(SUM(quantity), 0) INTO v_remaining_sale FROM public.inv_stock_movements
    WHERE reference_id = v_sale.id AND type::TEXT IN ('return_good', 'return_damaged');
  v_ratio := CASE WHEN v_original_subtotal > 0 THEN
    GREATEST(0, v_original_subtotal - COALESCE(v_sale.discount_amount, 0) + COALESCE(v_sale.tax_amount, 0)) / v_original_subtotal ELSE 0 END;
  v_type := CASE WHEN p_condition = 'good' THEN 'return_good'::public.inv_stock_movement_type ELSE 'return_damaged'::public.inv_stock_movement_type END;

  FOR v_item IN SELECT * FROM public.inv_sale_items WHERE sale_id = v_sale.id AND product_id = p_product_id ORDER BY id FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_assigned FROM public.inv_stock_movements
      WHERE reference_id = v_sale.id AND sale_item_id = v_item.id AND type::TEXT IN ('return_good', 'return_damaged');
    -- Older movements have no line reference: allocate them once, in stable line order.
    v_used := LEAST(v_legacy, GREATEST(0, v_item.quantity - v_assigned));
    v_legacy := v_legacy - v_used;
    v_available := GREATEST(0, v_item.quantity - v_assigned - v_used);
    IF p_sale_item_id IS NOT NULL AND v_item.id <> p_sale_item_id THEN CONTINUE; END IF;
    v_take := LEAST(v_available, v_left);
    IF v_take <= 0 THEN CONTINUE; END IF;
    v_raw_refund := v_raw_refund + v_take * v_item.unit_price;
    INSERT INTO public.inv_stock_movements(product_id, type, quantity, reference_id, sale_item_id, notes, created_by)
      VALUES(p_product_id, v_type, v_take, v_sale.id, v_item.id,
        COALESCE(NULLIF(p_notes, ''), 'Return from invoice ' || p_invoice_number || ' (' || p_condition || ')'), p_created_by)
      RETURNING id INTO v_movement_id;
    v_movements := array_append(v_movements, v_movement_id);
    v_left := v_left - v_take;
    EXIT WHEN v_left = 0;
  END LOOP;
  IF v_left > 0 THEN RAISE EXCEPTION 'Return quantity exceeds remaining returnable quantity for this item'; END IF;

  IF p_condition = 'good' THEN
    UPDATE public.inv_stock SET quantity = COALESCE(quantity, 0) + p_quantity,
      qty_meegoda = COALESCE(qty_meegoda, 0) + CASE WHEN COALESCE(v_sale.shop, 'Meegoda') NOT IN ('Padukka', 'Padukka new') THEN p_quantity ELSE 0 END,
      qty_padukka = COALESCE(qty_padukka, 0) + CASE WHEN v_sale.shop = 'Padukka' THEN p_quantity ELSE 0 END,
      qty_padukka_new = COALESCE(qty_padukka_new, 0) + CASE WHEN v_sale.shop = 'Padukka new' THEN p_quantity ELSE 0 END,
      updated_at = now() WHERE product_id = p_product_id;
  ELSE
    UPDATE public.inv_stock SET damaged_quantity = COALESCE(damaged_quantity, 0) + p_quantity, updated_at = now() WHERE product_id = p_product_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % has no stock record', p_product_id; END IF;

  -- Refund merchandise, including its share of discounts/tax; delivery remains charged.
  v_refund := LEAST(ROUND(v_raw_refund * v_ratio, 2), GREATEST(0, v_sale.net_amount - COALESCE(v_sale.delivery_fee, 0)));
  IF p_quantity = v_remaining_sale THEN v_refund := GREATEST(0, v_sale.net_amount - COALESCE(v_sale.delivery_fee, 0)); END IF;
  UPDATE public.inv_stock_movements SET refund_amount = 0 WHERE id = ANY(v_movements);
  UPDATE public.inv_stock_movements SET refund_amount = v_refund WHERE id = v_movements[1];
  UPDATE public.inv_sales SET total_amount = GREATEST(0, total_amount - v_raw_refund),
    net_amount = GREATEST(0, net_amount - v_refund) WHERE id = v_sale.id;
  RETURN jsonb_build_object('success', true, 'refund_amount', v_refund, 'condition', p_condition, 'shop', v_sale.shop);
END;
$$;

-- Preserve the old RPC signature for older clients while using the same locking and ledger.
CREATE OR REPLACE FUNCTION public.process_return(
  p_invoice_number TEXT, p_product_id UUID, p_quantity INTEGER, p_condition TEXT,
  p_notes TEXT DEFAULT NULL, p_created_by TEXT DEFAULT 'system'
) RETURNS JSONB LANGUAGE SQL SET search_path = public AS $$
  SELECT public.process_return_item(p_invoice_number, p_product_id, p_quantity, p_condition, p_notes, p_created_by, NULL);
$$;
REVOKE ALL ON FUNCTION public.process_return_item(TEXT,UUID,INTEGER,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_return_item(TEXT,UUID,INTEGER,TEXT,TEXT,TEXT,UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
