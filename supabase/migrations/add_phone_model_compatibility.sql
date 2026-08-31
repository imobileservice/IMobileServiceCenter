-- Phone Model Compatibility
--
-- ONE physical product (e.g. "Display A", SKU DSP001, stock 5) can fit MANY
-- phone models (Redmi Note 8 / 8T / 9 / 9S / 10). Those are not five products
-- and not five stock pools - they are one product row, one inv_stock row, and
-- five rows in the join table below.
--
-- Nothing in here touches products, inv_stock, orders or customers beyond
-- adding one optional `sku` column. Existing products keep working with zero
-- compatibility rows.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. products.sku
-- ---------------------------------------------------------------------------
-- The catalogue already auto-generates a 6-digit `barcode` per product. SKU is
-- the human-facing code the shop uses on supplier sheets ("DSP001"), so it gets
-- its own optional column rather than overloading barcode.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

-- Partial unique index: many products may have no SKU yet, but a SKU that IS
-- set has to be unique (case-insensitively).
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_lower
  ON products (LOWER(sku))
  WHERE sku IS NOT NULL AND sku <> '';

-- ---------------------------------------------------------------------------
-- 2. phone_models
-- ---------------------------------------------------------------------------
-- A phone the shop stocks parts for. `brands` already exists (add_brands_table.sql)
-- and is reused as the brand tier - no second brand list.
--
--   Samsung | Galaxy A51    | SM-A515F   | {A51, Samsung A51}
--   Xiaomi  | Redmi Note 8  | M1908C3JG  | {Note 8, RN8}
CREATE TABLE IF NOT EXISTS phone_models (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_code TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- "Redmi Note 8" cannot be added twice under Xiaomi, in any casing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_models_brand_name_lower
  ON phone_models (brand_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_phone_models_brand_id ON phone_models (brand_id);
CREATE INDEX IF NOT EXISTS idx_phone_models_name_lower ON phone_models (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_phone_models_active ON phone_models (is_active);
CREATE INDEX IF NOT EXISTS idx_phone_models_aliases ON phone_models USING GIN (aliases);

-- ---------------------------------------------------------------------------
-- 3. product_compatibility  (the many-to-many join)
-- ---------------------------------------------------------------------------
-- DELIBERATELY has no quantity/stock/price column. Stock lives in inv_stock,
-- one row per product_id. Adding 10 compatibility rows to Display A leaves its
-- stock at 5; selling one still takes it to 4. If anyone ever adds a quantity
-- column here, that guarantee is gone.
CREATE TABLE IF NOT EXISTS product_compatibility (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  phone_model_id UUID NOT NULL REFERENCES phone_models(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  PRIMARY KEY (product_id, phone_model_id)
);

-- Both directions are queried: product page lists its models, the phone finder
-- lists a model's products.
CREATE INDEX IF NOT EXISTS idx_product_compatibility_product ON product_compatibility (product_id);
CREATE INDEX IF NOT EXISTS idx_product_compatibility_model ON product_compatibility (phone_model_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger for phone_models (matches existing tables)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_phone_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phone_models_updated_at ON phone_models;
CREATE TRIGGER trg_phone_models_updated_at
  BEFORE UPDATE ON phone_models
  FOR EACH ROW EXECUTE FUNCTION set_phone_models_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS - same shape as brands/filters
-- ---------------------------------------------------------------------------
ALTER TABLE phone_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_compatibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Phone models are viewable by everyone" ON phone_models;
CREATE POLICY "Phone models are viewable by everyone" ON phone_models
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can manage phone models" ON phone_models;
CREATE POLICY "Only admins can manage phone models" ON phone_models
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND email = 'imobile.admin@gmail.com'
    )
  );

DROP POLICY IF EXISTS "Compatibility is viewable by everyone" ON product_compatibility;
CREATE POLICY "Compatibility is viewable by everyone" ON product_compatibility
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can manage compatibility" ON product_compatibility;
CREATE POLICY "Only admins can manage compatibility" ON product_compatibility
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Seed phone_models from data the project already has
-- ---------------------------------------------------------------------------
-- Additive only: nothing is updated or deleted, duplicates are skipped. This is
-- what stops the admin from starting with an empty model picker.

-- 6a. From brands.models (the cached/AI-discovered model list per brand)
INSERT INTO phone_models (brand_id, name)
SELECT b.id, TRIM(m.value)
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(b.models) = 'array' THEN b.models ELSE '[]'::jsonb END
) AS m(value)
WHERE TRIM(m.value) <> ''
ON CONFLICT DO NOTHING;

-- 6b. From the model already typed on existing products (products.specs->>'model'),
--     so today's catalogue is represented straight away.
INSERT INTO phone_models (brand_id, name)
SELECT DISTINCT b.id, TRIM(p.specs->>'model')
FROM products p
JOIN brands b ON LOWER(b.name) = LOWER(TRIM(p.brand))
WHERE p.specs->>'model' IS NOT NULL
  AND TRIM(p.specs->>'model') <> ''
  AND LOWER(TRIM(p.specs->>'model')) <> 'custom'
ON CONFLICT DO NOTHING;

-- 6c. Back-fill compatibility for existing products from their single
--     specs.model value, so a product that already says "Redmi Note 8" is
--     findable through the new phone finder without re-editing it.
--     Stock is untouched - this only writes join rows.
INSERT INTO product_compatibility (product_id, phone_model_id)
SELECT p.id, pm.id
FROM products p
JOIN brands b ON LOWER(b.name) = LOWER(TRIM(p.brand))
JOIN phone_models pm
  ON pm.brand_id = b.id
 AND LOWER(pm.name) = LOWER(TRIM(p.specs->>'model'))
WHERE p.specs->>'model' IS NOT NULL
  AND TRIM(p.specs->>'model') <> ''
ON CONFLICT DO NOTHING;
