-- Script to assign category_id to existing products based on product name/brand/description
-- Run this after refactor_products_categories_images.sql

-- This will help categorize products that don't have category_id set yet

DO $$
DECLARE
  cat_record RECORD;
  product_record RECORD;
BEGIN
  -- Loop through all products without category_id
  FOR product_record IN 
    SELECT id, name, brand, description 
    FROM products 
    WHERE category_id IS NULL
  LOOP
    -- Try to match based on product name and description patterns
    
    -- iPhone products -> mobile-phones-iphone
    IF (product_record.brand ILIKE '%apple%' AND (product_record.name ILIKE '%iphone%' OR product_record.name ILIKE '%iPhone%')) THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-iphone' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Samsung products -> mobile-phones-samsung
    IF product_record.brand ILIKE '%samsung%' AND (product_record.name ILIKE '%galaxy%' OR product_record.name ILIKE '%samsung%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-samsung' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- OnePlus products -> mobile-phones-oneplus
    IF product_record.brand ILIKE '%oneplus%' OR product_record.name ILIKE '%oneplus%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-oneplus' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Google Pixel products -> mobile-phones-google-pixel
    IF product_record.brand ILIKE '%google%' OR (product_record.name ILIKE '%pixel%' OR product_record.name ILIKE '%google%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-google-pixel' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Battery products
    IF product_record.name ILIKE '%battery%' OR product_record.description ILIKE '%battery%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'battery' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Charger products
    IF product_record.name ILIKE '%charger%' OR product_record.description ILIKE '%charger%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'charger' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Power Bank products
    IF product_record.name ILIKE '%power%bank%' OR product_record.name ILIKE '%powerbank%' OR product_record.description ILIKE '%power bank%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'power-bank' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Screen Guard products
    IF product_record.name ILIKE '%screen%guard%' OR product_record.name ILIKE '%screen%protector%' OR product_record.description ILIKE '%screen guard%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'screen-guard' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Display products
    IF product_record.name ILIKE '%display%' OR product_record.name ILIKE '%screen%' OR product_record.description ILIKE '%display%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'display' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Handsfree/Earbuds products
    IF product_record.name ILIKE '%earbud%' OR product_record.name ILIKE '%headphone%' OR product_record.name ILIKE '%headset%' OR product_record.description ILIKE '%earbud%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-handsfree' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Cable products
    IF product_record.name ILIKE '%cable%' OR product_record.name ILIKE '%data%transfer%' OR product_record.description ILIKE '%cable%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-cables' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- Case/Cover products
    IF product_record.name ILIKE '%case%' OR product_record.name ILIKE '%cover%' OR product_record.description ILIKE '%case%' THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-cases' LIMIT 1;
      IF cat_record.id IS NOT NULL THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        CONTINUE;
      END IF;
    END IF;
    
    -- If no match found, assign to a default category (you can change this)
    -- SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-other' LIMIT 1;
    -- IF cat_record.id IS NOT NULL THEN
    --   UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
    -- END IF;
    
  END LOOP;
END $$;

-- Show summary
SELECT 
  'Products with category_id' as status,
  COUNT(*) as count
FROM products
WHERE category_id IS NOT NULL
UNION ALL
SELECT 
  'Products without category_id',
  COUNT(*)
FROM products
WHERE category_id IS NULL;

