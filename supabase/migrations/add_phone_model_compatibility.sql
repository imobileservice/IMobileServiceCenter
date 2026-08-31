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

-- 6z. Display grades are NOT phone models.
--
-- The shop writes the panel grade into a display's model text: "M02 W/F" is a
-- With Frame display for a phone called M02; "A32 4G Incell" is an Incell panel
-- for an A32 4G. Seeding those verbatim splits one phone into several "models",
-- so a cashier searching the real phone name finds only some of the stock.
-- The grade is kept on the product as specs.quality - nothing is lost here.
-- An earlier version of this file defined a one-argument version. Leaving it
-- in place would make clean_phone_model_name(x) ambiguous against the new
-- two-argument form with its default, so it goes first.
DROP FUNCTION IF EXISTS clean_phone_model_name(TEXT);

CREATE OR REPLACE FUNCTION clean_phone_model_name(raw TEXT, brand TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  out_name TEXT := TRIM(COALESCE(raw, ''));
  brand_name TEXT := TRIM(COALESCE(brand, ''));
  stripped TEXT;
  grade TEXT;
  grades TEXT[] := ARRAY[
    'with frame', 'w/frame', 'w/f', 'wf', 'without frame', 'no frame',
    'incell', 'in-cell', 'in cell', 'amoled', 'soft oled', 'hard oled',
    'oled', 'tft', 'ips', 'lcd', 'service pack', 'original', 'oem',
    'combo', 'folder', 'display', 'screen'
  ];
BEGIN
  IF out_name = '' THEN RETURN ''; END IF;

  -- A model that repeats its own brand prints twice: "samsung A32" under
  -- Samsung becomes "Samsung samsung A32" on the picker and on a bill.
  IF brand_name <> '' THEN
    stripped := TRIM(REGEXP_REPLACE(out_name, '^' || brand_name || '\M[[:space:]-]*', '', 'i'));
    IF stripped <> '' THEN
      out_name := stripped;
    END IF;
  END IF;

  FOREACH grade IN ARRAY grades LOOP
    -- Whole token only, so the "4G" in "10 4G" and the "F" in "F62" survive.
    out_name := REGEXP_REPLACE(
      out_name,
      '(^|[[:space:](/-])' || grade || '($|[[:space:])/-])',
      '\1 \2',
      'gi'
    );
  END LOOP;

  out_name := TRIM(REGEXP_REPLACE(out_name, '\s+', ' ', 'g'));
  out_name := TRIM(BOTH ' /-' FROM out_name);

  -- Never erase a name completely - fall back to what was given.
  RETURN COALESCE(NULLIF(out_name, ''), TRIM(raw));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6a. From brands.models (the cached/AI-discovered model list per brand)
INSERT INTO phone_models (brand_id, name)
SELECT b.id, clean_phone_model_name(m.value, b.name)
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(b.models) = 'array' THEN b.models ELSE '[]'::jsonb END
) AS m(value)
WHERE clean_phone_model_name(m.value, b.name) <> ''
ON CONFLICT DO NOTHING;

-- 6b. From the model already typed on existing products (products.specs->>'model'),
--     so today's catalogue is represented straight away.
INSERT INTO phone_models (brand_id, name)
SELECT DISTINCT b.id, clean_phone_model_name(p.specs->>'model', b.name)
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
 AND LOWER(pm.name) = LOWER(clean_phone_model_name(p.specs->>'model', b.name))
WHERE p.specs->>'model' IS NOT NULL
  AND TRIM(p.specs->>'model') <> ''
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Fold duplicate models into one row
-- ---------------------------------------------------------------------------
-- This is what makes the file genuinely safe to re-run.
--
-- Section 6 only ever INSERTS. So when the seed rule changed - it now stores
-- "M02" where it used to store "M02 W/F" - a second run added the clean name
-- BESIDE the old one instead of correcting it, and every affected display
-- ended up showing two chips for the same phone.
--
-- This section converges the table instead: for each brand, every row whose
-- cleaned name is the same phone collapses into ONE row. Links and past sale
-- lines are moved to the survivor first, so nothing is lost, and the survivor
-- is then stored under its clean name.
--
-- Run it as many times as you like - once the catalogue is clean it does
-- nothing. It never touches products, product names, inv_stock or sale totals.
DO $$
DECLARE
  has_sale_col BOOLEAN;
  grp RECORD;
  keep_id UUID;
BEGIN
  -- inv_sale_items.phone_model_id only exists once add_sold_as_model_name.sql
  -- has been run; skip that step cleanly when it has not.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inv_sale_items'
      AND column_name = 'phone_model_id'
  ) INTO has_sale_col;

  FOR grp IN
    SELECT pm.brand_id AS brand_id,
           LOWER(clean_phone_model_name(pm.name, b.name)) AS key
    FROM phone_models pm
    JOIN brands b ON b.id = pm.brand_id
    GROUP BY pm.brand_id, LOWER(clean_phone_model_name(pm.name, b.name))
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the row that is already stored clean; otherwise the oldest, which
    -- is the one most likely to be referenced elsewhere.
    SELECT pm.id INTO keep_id
    FROM phone_models pm
    JOIN brands b ON b.id = pm.brand_id
    WHERE pm.brand_id = grp.brand_id
      AND LOWER(clean_phone_model_name(pm.name, b.name)) = grp.key
    ORDER BY (pm.name = clean_phone_model_name(pm.name, b.name)) DESC, pm.created_at ASC
    LIMIT 1;

    -- Every product linked to a duplicate becomes linked to the survivor.
    INSERT INTO product_compatibility (product_id, phone_model_id)
    SELECT DISTINCT pc.product_id, keep_id
    FROM product_compatibility pc
    JOIN phone_models pm ON pm.id = pc.phone_model_id
    JOIN brands b ON b.id = pm.brand_id
    WHERE pm.brand_id = grp.brand_id
      AND LOWER(clean_phone_model_name(pm.name, b.name)) = grp.key
      AND pc.phone_model_id <> keep_id
    ON CONFLICT DO NOTHING;

    -- Past sales keep pointing at a model that still exists.
    IF has_sale_col THEN
      UPDATE inv_sale_items s
      SET phone_model_id = keep_id
      WHERE s.phone_model_id IN (
        SELECT pm.id
        FROM phone_models pm
        JOIN brands b ON b.id = pm.brand_id
        WHERE pm.brand_id = grp.brand_id
          AND LOWER(clean_phone_model_name(pm.name, b.name)) = grp.key
          AND pm.id <> keep_id
      );
    END IF;

    -- The duplicates go; their join rows cascade away with them.
    DELETE FROM phone_models pm
    USING brands b
    WHERE b.id = pm.brand_id
      AND pm.brand_id = grp.brand_id
      AND LOWER(clean_phone_model_name(pm.name, b.name)) = grp.key
      AND pm.id <> keep_id;
  END LOOP;

  -- With the duplicates gone, each surviving name is free to be stored clean.
  UPDATE phone_models pm
  SET name = clean_phone_model_name(pm.name, b.name)
  FROM brands b
  WHERE b.id = pm.brand_id
    AND pm.name <> clean_phone_model_name(pm.name, b.name);
END $$;
