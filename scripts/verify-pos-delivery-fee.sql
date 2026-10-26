-- Run only in a fresh, disposable local PostgreSQL database named pos_delivery_fee_test.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'pos_delivery_fee_test' THEN
    RAISE EXCEPTION 'This fixture requires the disposable pos_delivery_fee_test database';
  END IF;
END $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TYPE inv_payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'online');
CREATE TYPE inv_sale_source AS ENUM ('pos', 'website');
CREATE TABLE inv_suppliers (id UUID PRIMARY KEY);
CREATE TABLE phone_models (id UUID PRIMARY KEY);
CREATE TABLE products (id UUID PRIMARY KEY, name TEXT);
CREATE TABLE pos_tills (id UUID PRIMARY KEY, code_hint TEXT);
CREATE TABLE pos_till_sessions (id UUID PRIMARY KEY, till_id UUID, status TEXT, expires_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ);
CREATE TABLE inv_stock (product_id UUID PRIMARY KEY, quantity INT, qty_meegoda INT, qty_padukka INT, qty_padukka_new INT, updated_at TIMESTAMPTZ);
CREATE TABLE inv_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number TEXT, customer_id UUID,
  customer_name TEXT, customer_phone TEXT, total_amount NUMERIC, discount_amount NUMERIC,
  tax_amount NUMERIC, net_amount NUMERIC, payment_method inv_payment_method,
  source inv_sale_source, notes TEXT, created_by TEXT, shop TEXT,
  pos_session_id UUID, till_id UUID, till_code TEXT
);
CREATE TABLE inv_sale_items (sale_id UUID, product_id UUID, product_name TEXT, quantity INT, unit_price NUMERIC, total_price NUMERIC);
CREATE TABLE inv_stock_movements (product_id UUID, type TEXT, quantity INT, reference_id UUID, notes TEXT, created_by TEXT);
CREATE SEQUENCE invoice_seq;
CREATE FUNCTION generate_invoice_number() RETURNS TEXT LANGUAGE SQL AS $$ SELECT 'TEST-' || nextval('invoice_seq'); $$;
\ir ../supabase/migrations/add_sold_as_model_name.sql
\ir ../supabase/migrations/add_pos_delivery_fee.sql
-- Verify rerunning the migration is safe.
\ir ../supabase/migrations/add_pos_delivery_fee.sql

INSERT INTO products VALUES ('00000000-0000-0000-0000-000000000001', 'Samsung M02s Display');
INSERT INTO inv_stock VALUES ('00000000-0000-0000-0000-000000000001', 100, 100, 0, 0, now());
INSERT INTO inv_suppliers VALUES ('00000000-0000-0000-0000-000000000002');

DO $$
DECLARE
  v_items JSONB := '[{"product_id":"00000000-0000-0000-0000-000000000001","quantity":1,"price":2950,"sold_as":"Samsung A02 Display"}]';
  v_result JSONB;
  v_sale public.inv_sales;
  v_count INT;
  v_stock INT;
BEGIN
  v_result := process_sale_with_delivery(p_items := v_items, p_supplier_id := '00000000-0000-0000-0000-000000000002', p_delivery_fee := 350.25);
  SELECT * INTO STRICT v_sale FROM inv_sales WHERE id = (v_result->>'sale_id')::UUID;
  ASSERT v_sale.delivery_fee = 350.25 AND v_sale.net_amount = 3300.25;
  ASSERT v_sale.total_amount = 2950 AND v_sale.supplier_id = '00000000-0000-0000-0000-000000000002'::UUID;
  ASSERT (v_result->>'net_amount')::NUMERIC = v_sale.net_amount;
  ASSERT (SELECT product_name FROM inv_sale_items WHERE sale_id = v_sale.id) = 'Samsung A02 Display';
  ASSERT (SELECT qty_meegoda FROM inv_stock LIMIT 1) = 99;

  v_result := process_sale_with_delivery(p_items := v_items, p_delivery_fee := 350.25);
  ASSERT (v_result->>'delivery_fee')::NUMERIC = 0;
  ASSERT (v_result->>'net_amount')::NUMERIC = 2950;
  -- Old walk-in RPC remains compatible after the migration.
  v_result := process_sale(p_items := v_items);
  ASSERT (SELECT delivery_fee FROM inv_sales WHERE id = (v_result->>'sale_id')::UUID) = 0;

  v_result := process_sale_with_delivery(p_items := v_items, p_customer_id := '00000000-0000-0000-0000-000000000003', p_delivery_fee := 350.25, p_discount := 100, p_tax := 25);
  ASSERT (v_result->>'net_amount')::NUMERIC = 3225.25;

  SELECT count(*) INTO v_count FROM inv_sales;
  SELECT qty_meegoda INTO v_stock FROM inv_stock LIMIT 1;
  BEGIN
    -- Fails AFTER process_sale has run: its sale, items and stock changes must all roll back.
    PERFORM process_sale_with_delivery(p_items := v_items, p_supplier_id := '00000000-0000-0000-0000-000000000099', p_delivery_fee := 350.25);
    RAISE EXCEPTION 'Expected a foreign-key failure';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM inv_sales) = v_count;
  ASSERT (SELECT qty_meegoda FROM inv_stock LIMIT 1) = v_stock;
  ASSERT (SELECT count(*) FROM inv_sale_items) = v_count;
  ASSERT (SELECT count(*) FROM inv_stock_movements) = v_count;
  ASSERT NOT has_function_privilege('anon', 'process_sale_with_delivery(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text,uuid,numeric,uuid)', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'process_sale_with_delivery(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text,uuid,numeric,uuid)', 'EXECUTE');
  RAISE NOTICE 'PASS: stored fees/totals, walk-ins, discounts/tax, sold-as name, stock deduction, rollback and RPC permissions';
END $$;
