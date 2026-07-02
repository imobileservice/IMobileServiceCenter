-- ============================================================
-- POS TILLS, TILL SESSIONS, AND CASHIER AUDIT TRAIL
-- Cashier POS no longer uses email OTP. The till code identifies
-- the terminal, and the cashier/admin credentials identify the user.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS pos_tills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  shop TEXT NOT NULL DEFAULT 'Meegoda',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_till_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  till_id UUID NOT NULL REFERENCES pos_tills(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL,
  cashier_email TEXT NOT NULL,
  cashier_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('cashier', 'admin')),
  shop TEXT NOT NULL DEFAULT 'Meegoda',
  opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_float NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'forced_closed')),
  session_token_hash TEXT NOT NULL,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT
);

CREATE TABLE IF NOT EXISTS pos_auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID,
  cashier_email TEXT,
  role TEXT,
  till_id UUID REFERENCES pos_tills(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_till_sessions_one_open_till
  ON pos_till_sessions(till_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_pos_till_sessions_cashier ON pos_till_sessions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_pos_till_sessions_opened_at ON pos_till_sessions(opened_at);
CREATE INDEX IF NOT EXISTS idx_pos_auth_events_created_at ON pos_auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_auth_events_email ON pos_auth_events(cashier_email);

-- Default till codes. Rotate these in production after applying the migration.
INSERT INTO pos_tills (code_hash, code_hint, label, shop, status)
VALUES
  (encode(digest('MEG-01', 'sha256'), 'hex'), 'MEG-01', 'Meegoda Till 01', 'Meegoda', 'active'),
  (encode(digest('PAD-01', 'sha256'), 'hex'), 'PAD-01', 'Padukka Till 01', 'Padukka', 'active'),
  (encode(digest('PDN-01', 'sha256'), 'hex'), 'PDN-01', 'Padukka New Till 01', 'Padukka new', 'active')
ON CONFLICT (code_hash) DO UPDATE SET
  code_hint = EXCLUDED.code_hint,
  label = EXCLUDED.label,
  shop = EXCLUDED.shop,
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE inv_sales ADD COLUMN IF NOT EXISTS pos_session_id UUID REFERENCES pos_till_sessions(id) ON DELETE SET NULL;
ALTER TABLE inv_sales ADD COLUMN IF NOT EXISTS till_id UUID REFERENCES pos_tills(id) ON DELETE SET NULL;
ALTER TABLE inv_sales ADD COLUMN IF NOT EXISTS till_code TEXT;

CREATE INDEX IF NOT EXISTS idx_inv_sales_pos_session_id ON inv_sales(pos_session_id);
CREATE INDEX IF NOT EXISTS idx_inv_sales_till_id ON inv_sales(till_id);

DROP FUNCTION IF EXISTS process_sale(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT);

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
BEGIN
  v_invoice := generate_invoice_number();

  IF p_pos_session_id IS NOT NULL THEN
    SELECT s.till_id, t.code_hint
      INTO v_till_id, v_till_code
    FROM pos_till_sessions s
    JOIN pos_tills t ON t.id = s.till_id
    WHERE s.id = p_pos_session_id
      AND s.status = 'open';

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

ALTER TABLE pos_tills ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_till_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON pos_tills;
CREATE POLICY "service_role_all" ON pos_tills
  FOR ALL USING (auth.jwt()->>'role' = 'service_role') WITH CHECK (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "service_role_all" ON pos_till_sessions;
CREATE POLICY "service_role_all" ON pos_till_sessions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role') WITH CHECK (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "service_role_all" ON pos_auth_events;
CREATE POLICY "service_role_all" ON pos_auth_events
  FOR ALL USING (auth.jwt()->>'role' = 'service_role') WITH CHECK (auth.jwt()->>'role' = 'service_role');
