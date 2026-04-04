-- ============================================================
-- INVENTORY & POS SYSTEM - DATABASE MIGRATION
-- IMobile Service Center
-- ============================================================

-- 1. Add barcode and cost_price to existing products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;

-- 2. Create ENUM types
DO $$ BEGIN
  CREATE TYPE inv_stock_movement_type AS ENUM ('sale', 'purchase', 'adjustment', 'return');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inv_sale_source AS ENUM ('pos', 'website');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inv_payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'online');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Inventory Stock Table
CREATE TABLE IF NOT EXISTS inv_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

-- 4. Stock Movements (audit trail)
CREATE TABLE IF NOT EXISTS inv_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type inv_stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL, -- positive for increases, negative for decreases
  reference_id UUID, -- sale_id or purchase_id
  notes TEXT,
  created_by TEXT, -- admin email or 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. POS Customers
CREATE TABLE IF NOT EXISTS inv_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Sales
CREATE TABLE IF NOT EXISTS inv_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES inv_customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method inv_payment_method NOT NULL DEFAULT 'cash',
  source inv_sale_source NOT NULL DEFAULT 'pos',
  notes TEXT,
  created_by TEXT, -- cashier/admin email
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Sale Items
CREATE TABLE IF NOT EXISTS inv_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES inv_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Suppliers
CREATE TABLE IF NOT EXISTS inv_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Purchases
CREATE TABLE IF NOT EXISTS inv_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES inv_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Purchase Items
CREATE TABLE IF NOT EXISTS inv_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES inv_purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  cost_price NUMERIC(12,2) NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inv_stock_product ON inv_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_movements_product ON inv_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_movements_type ON inv_stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_inv_stock_movements_created ON inv_stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_sales_created ON inv_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_sales_source ON inv_sales(source);
CREATE INDEX IF NOT EXISTS idx_inv_sales_invoice ON inv_sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_inv_sale_items_sale ON inv_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_inv_purchases_created ON inv_purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_purchase_items_purchase ON inv_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- ============================================================
-- TRIGGER: Sync inv_stock.quantity → products.stock
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET stock = NEW.quantity, updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_stock ON inv_stock;
CREATE TRIGGER trg_sync_product_stock
  AFTER INSERT OR UPDATE OF quantity ON inv_stock
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_stock();

-- ============================================================
-- TRIGGER: Auto-initialize inv_stock when a product is created
-- ============================================================
CREATE OR REPLACE FUNCTION auto_init_inv_stock()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inv_stock (product_id, quantity, low_stock_threshold)
  VALUES (NEW.id, COALESCE(NEW.stock, 0), 5)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_init_inv_stock ON products;
CREATE TRIGGER trg_auto_init_inv_stock
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION auto_init_inv_stock();

-- ============================================================
-- RPC: Generate unique invoice number
-- ============================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  today_str TEXT;
  seq_num INTEGER;
  invoice TEXT;
BEGIN
  today_str := to_char(now(), 'YYYYMMDD');
  
  SELECT COUNT(*) + 1 INTO seq_num
  FROM inv_sales
  WHERE invoice_number LIKE 'INV-' || today_str || '-%';
  
  invoice := 'INV-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN invoice;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: Process Sale (TRANSACTIONAL)
-- ============================================================
CREATE OR REPLACE FUNCTION process_sale(
  p_customer_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'Walk-in Customer',
  p_payment_method TEXT DEFAULT 'cash',
  p_source TEXT DEFAULT 'pos',
  p_discount NUMERIC DEFAULT 0,
  p_tax NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system',
  p_items JSONB DEFAULT '[]'::JSONB
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
  v_current_stock INTEGER;
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
    
    -- Check stock availability
    SELECT quantity INTO v_current_stock
    FROM inv_stock WHERE product_id = v_product_id FOR UPDATE;
    
    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Product % has no stock record', v_product_id;
    END IF;
    
    IF v_current_stock < v_quantity THEN
      SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
      RAISE EXCEPTION 'Insufficient stock for "%". Available: %, Requested: %', 
        COALESCE(v_product_name, v_product_id::TEXT), v_current_stock, v_quantity;
    END IF;
  END LOOP;
  
  -- Calculate net amount
  v_net := v_total - p_discount + p_tax;
  
  -- Insert sale record
  INSERT INTO inv_sales (
    invoice_number, customer_id, customer_name, total_amount, 
    discount_amount, tax_amount, net_amount, payment_method, 
    source, notes, created_by
  ) VALUES (
    v_invoice, p_customer_id, p_customer_name, v_total,
    p_discount, p_tax, v_net, p_payment_method::inv_payment_method,
    p_source::inv_sale_source, p_notes, p_created_by
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
    
    -- Decrease stock
    UPDATE inv_stock SET quantity = quantity - v_quantity, updated_at = now()
    WHERE product_id = v_product_id;
    
    -- Record movement
    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (v_product_id, 'sale', -v_quantity, v_sale_id, 'POS Sale: ' || v_invoice, p_created_by);
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

-- ============================================================
-- RPC: Process Purchase (TRANSACTIONAL)
-- ============================================================
CREATE OR REPLACE FUNCTION process_purchase(
  p_supplier_id UUID DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system',
  p_items JSONB DEFAULT '[]'::JSONB
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
  -- Calculate total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_cost := (v_item->>'cost_price')::NUMERIC;
    v_total := v_total + (v_quantity * v_cost);
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
    v_cost := (v_item->>'cost_price')::NUMERIC;
    v_item_total := v_quantity * v_cost;
    
    -- Get product name
    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
    
    -- Insert purchase item
    INSERT INTO inv_purchase_items (purchase_id, product_id, product_name, quantity, cost_price, total_cost)
    VALUES (v_purchase_id, v_product_id, v_product_name, v_quantity, v_cost, v_item_total);
    
    -- Increase stock (upsert)
    INSERT INTO inv_stock (product_id, quantity, low_stock_threshold)
    VALUES (v_product_id, v_quantity, 5)
    ON CONFLICT (product_id)
    DO UPDATE SET quantity = inv_stock.quantity + v_quantity, updated_at = now();
    
    -- Update product cost_price
    UPDATE products SET cost_price = v_cost WHERE id = v_product_id;
    
    -- Record movement
    INSERT INTO inv_stock_movements (product_id, type, quantity, reference_id, notes, created_by)
    VALUES (v_product_id, 'purchase', v_quantity, v_purchase_id, 'Purchase from: ' || COALESCE(p_supplier_name, 'Unknown'), p_created_by);
  END LOOP;
  
  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'total_cost', v_total,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Initialize inv_stock for existing products
-- ============================================================
INSERT INTO inv_stock (product_id, quantity, low_stock_threshold)
SELECT id, COALESCE(stock, 0), 5
FROM products
WHERE id NOT IN (SELECT product_id FROM inv_stock)
ON CONFLICT (product_id) DO NOTHING;

-- ============================================================
-- RLS POLICIES (allow service_role full access)
-- ============================================================
ALTER TABLE inv_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_purchase_items ENABLE ROW LEVEL SECURITY;

-- Allow service_role to do everything (backend uses service_role key)
DROP POLICY IF EXISTS "service_role_all" ON inv_stock;
CREATE POLICY "service_role_all" ON inv_stock FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_stock_movements;
CREATE POLICY "service_role_all" ON inv_stock_movements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_customers;
CREATE POLICY "service_role_all" ON inv_customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_sales;
CREATE POLICY "service_role_all" ON inv_sales FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_sale_items;
CREATE POLICY "service_role_all" ON inv_sale_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_suppliers;
CREATE POLICY "service_role_all" ON inv_suppliers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_purchases;
CREATE POLICY "service_role_all" ON inv_purchases FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON inv_purchase_items;
CREATE POLICY "service_role_all" ON inv_purchase_items FOR ALL USING (true) WITH CHECK (true);
