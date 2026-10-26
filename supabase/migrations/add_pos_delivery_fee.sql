-- Apply after add_sold_as_model_name.sql. Safe to re-run.
-- Keep sale creation, stock deduction and delivery-fee persistence in ONE transaction.
BEGIN;

ALTER TABLE public.inv_sales
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.inv_suppliers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.process_sale_with_delivery(
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
  p_pos_session_id UUID DEFAULT NULL,
  p_delivery_fee NUMERIC DEFAULT 0,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_fee NUMERIC := p_delivery_fee;
  v_net NUMERIC;
BEGIN
  IF v_fee IS NULL OR v_fee < 0 OR v_fee > 99999999.99 OR v_fee <> ROUND(v_fee, 2) THEN
    RAISE EXCEPTION 'Invalid delivery fee';
  END IF;
  IF p_customer_id IS NOT NULL AND p_supplier_id IS NOT NULL THEN
    RAISE EXCEPTION 'Select one customer or shop';
  END IF;
  IF p_customer_id IS NULL AND p_supplier_id IS NULL THEN
    v_fee := 0;
  END IF;

  v_result := public.process_sale(
    p_customer_id := p_customer_id, p_customer_name := p_customer_name,
    p_customer_phone := p_customer_phone, p_payment_method := p_payment_method,
    p_source := p_source, p_discount := p_discount, p_tax := p_tax,
    p_notes := p_notes, p_created_by := p_created_by, p_items := p_items,
    p_shop := p_shop, p_pos_session_id := p_pos_session_id
  );

  UPDATE public.inv_sales
  SET delivery_fee = v_fee, supplier_id = p_supplier_id, net_amount = net_amount + v_fee
  WHERE id = (v_result->>'sale_id')::UUID
  RETURNING net_amount INTO v_net;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale was not saved';
  END IF;

  RETURN v_result || jsonb_build_object('delivery_fee', v_fee, 'supplier_id', p_supplier_id, 'net_amount', v_net);
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale_with_delivery(UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TEXT,JSONB,TEXT,UUID,NUMERIC,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_with_delivery(UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TEXT,JSONB,TEXT,UUID,NUMERIC,UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
