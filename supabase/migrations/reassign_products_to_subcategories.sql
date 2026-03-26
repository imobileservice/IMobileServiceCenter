-- Script to reassign ALL products to correct subcategories based on brand/model
-- This will move products from parent categories (e.g., mobile-phones) to subcategories (e.g., mobile-phones-iphone)

DO $$
DECLARE
  cat_record RECORD;
  product_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Loop through ALL products (not just NULL category_id)
  FOR product_record IN 
    SELECT id, name, brand, description, category_id, condition
    FROM products
  LOOP
    -- Skip if product doesn't have a brand or name
    IF product_record.brand IS NULL AND product_record.name IS NULL THEN
      CONTINUE;
    END IF;
    
    -- ============================================
    -- MOBILE PHONES - Subcategory Assignment
    -- ============================================
    
    -- iPhone products -> mobile-phones-iphone
    IF (product_record.brand ILIKE '%apple%' OR product_record.name ILIKE '%iphone%' OR product_record.name ILIKE '%iPhone%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-iphone' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Samsung products -> mobile-phones-samsung
    IF (product_record.brand ILIKE '%samsung%' OR product_record.name ILIKE '%galaxy%' OR product_record.name ILIKE '%samsung%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-samsung' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- OnePlus products -> mobile-phones-oneplus
    IF (product_record.brand ILIKE '%oneplus%' OR product_record.name ILIKE '%oneplus%' OR product_record.name ILIKE '%one%plus%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-oneplus' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Google Pixel products -> mobile-phones-google-pixel
    IF (product_record.brand ILIKE '%google%' OR product_record.name ILIKE '%pixel%' OR product_record.name ILIKE '%google%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-google-pixel' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Oppo products -> mobile-phones-oppo
    IF (product_record.brand ILIKE '%oppo%' OR product_record.name ILIKE '%oppo%' OR product_record.name ILIKE '%find%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-oppo' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Vivo products -> mobile-phones-vivo
    IF (product_record.brand ILIKE '%vivo%' OR product_record.name ILIKE '%vivo%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-vivo' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Xiaomi products -> mobile-phones-xiaomi
    IF (product_record.brand ILIKE '%xiaomi%' OR product_record.brand ILIKE '%redmi%' OR product_record.name ILIKE '%xiaomi%' OR product_record.name ILIKE '%redmi%' OR product_record.name ILIKE '%mi%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-xiaomi' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Honor products -> mobile-phones-honor
    IF (product_record.brand ILIKE '%honor%' OR product_record.name ILIKE '%honor%' OR product_record.name ILIKE '%magic%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-honor' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Realme products -> mobile-phones-realme
    IF (product_record.brand ILIKE '%realme%' OR product_record.name ILIKE '%realme%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-realme' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Nokia products -> mobile-phones-nokia
    IF (product_record.brand ILIKE '%nokia%' OR product_record.name ILIKE '%nokia%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-nokia' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- ============================================
    -- TABLETS - Subcategory Assignment
    -- ============================================
    
    -- iPad products -> mobile-phones-tablets (or tablets-ipad if exists)
    IF (product_record.name ILIKE '%ipad%' OR product_record.name ILIKE '%iPad%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-tablets' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Samsung tablets -> mobile-phones-tablets
    IF ((product_record.brand ILIKE '%samsung%' OR product_record.name ILIKE '%galaxy%') AND (product_record.name ILIKE '%tab%' OR product_record.name ILIKE '%tablet%')) THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'mobile-phones-tablets' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- ============================================
    -- ACCESSORIES - Subcategory Assignment
    -- ============================================
    
    -- Handsfree/Earbuds products -> accessories-handsfree
    IF (product_record.name ILIKE '%earbud%' OR product_record.name ILIKE '%headphone%' OR product_record.name ILIKE '%headset%' OR product_record.description ILIKE '%earbud%' OR product_record.description ILIKE '%headphone%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-handsfree' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Cable products -> accessories-cables
    IF (product_record.name ILIKE '%cable%' OR product_record.name ILIKE '%data%transfer%' OR product_record.description ILIKE '%cable%' OR product_record.description ILIKE '%data%cable%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-cables' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Case/Cover products -> accessories-cases
    IF (product_record.name ILIKE '%case%' OR product_record.name ILIKE '%cover%' OR product_record.description ILIKE '%case%' OR product_record.description ILIKE '%cover%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'accessories-cases' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- ============================================
    -- USED ITEMS - Subcategory Assignment
    -- ============================================
    
    -- Used iPhone -> used-items-iphone
    IF (product_record.condition = 'used' AND (product_record.brand ILIKE '%apple%' OR product_record.name ILIKE '%iphone%' OR product_record.name ILIKE '%iPhone%')) THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'used-items-iphone' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Used Samsung -> used-items-samsung
    IF (product_record.condition = 'used' AND (product_record.brand ILIKE '%samsung%' OR product_record.name ILIKE '%galaxy%')) THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'used-items-samsung' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- ============================================
    -- OTHER CATEGORIES
    -- ============================================
    
    -- Battery products
    IF (product_record.name ILIKE '%battery%' OR product_record.description ILIKE '%battery%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'battery' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Charger products
    IF (product_record.name ILIKE '%charger%' OR product_record.description ILIKE '%charger%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'charger' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Power Bank products
    IF (product_record.name ILIKE '%power%bank%' OR product_record.name ILIKE '%powerbank%' OR product_record.description ILIKE '%power bank%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'power-bank' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Screen Guard products
    IF (product_record.name ILIKE '%screen%guard%' OR product_record.name ILIKE '%screen%protector%' OR product_record.description ILIKE '%screen guard%' OR product_record.description ILIKE '%screen protector%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'screen-guard' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Display products
    IF (product_record.name ILIKE '%display%' OR product_record.name ILIKE '%screen%' OR product_record.description ILIKE '%display%' OR product_record.description ILIKE '%lcd%' OR product_record.description ILIKE '%oled%') THEN
      -- Only assign to display if it's not a full phone (phones have brand/model info)
      IF product_record.brand IS NULL OR (product_record.name NOT ILIKE '%phone%' AND product_record.name NOT ILIKE '%mobile%') THEN
        SELECT id INTO cat_record FROM categories WHERE slug = 'display' LIMIT 1;
        IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
          UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
          updated_count := updated_count + 1;
          CONTINUE;
        END IF;
      END IF;
    END IF;
    
    -- Housing products
    IF (product_record.name ILIKE '%housing%' OR product_record.name ILIKE '%back%cover%' OR product_record.description ILIKE '%housing%' OR product_record.description ILIKE '%back cover%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'housing' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- IC products
    IF (product_record.name ILIKE '%ic%' OR product_record.name ILIKE '%chip%' OR product_record.description ILIKE '%ic%' OR product_record.description ILIKE '%integrated circuit%') THEN
      SELECT id INTO cat_record FROM categories WHERE slug = 'ic' LIMIT 1;
      IF cat_record.id IS NOT NULL AND product_record.category_id != cat_record.id THEN
        UPDATE products SET category_id = cat_record.id WHERE id = product_record.id;
        updated_count := updated_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
  END LOOP;
  
  RAISE NOTICE 'Updated % products to correct subcategories', updated_count;
END $$;

-- Show summary by category
SELECT 
  c.name as category_name,
  c.slug as category_slug,
  COUNT(p.id) as product_count
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.name, c.slug
ORDER BY c.sort_order, c.name;

-- Show products that still need categorization
SELECT 
  p.id,
  p.name,
  p.brand,
  CASE 
    WHEN p.category_id IS NULL THEN 'NO CATEGORY'
    ELSE 'NEEDS REVIEW'
  END as status
FROM products p
WHERE p.category_id IS NULL
   OR p.category_id IN (SELECT id FROM categories WHERE slug IN ('mobile-phones', 'accessories', 'used-items'))
ORDER BY p.name
LIMIT 20;

