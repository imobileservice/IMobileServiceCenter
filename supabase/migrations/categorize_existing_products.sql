-- Script to manage products by category and identify products to delete
-- NOTE: This script works after the category field has been removed and category_id is being used

-- Step 1: Show all products with their current category
SELECT 
  p.id,
  p.name,
  p.brand,
  c.name as current_category,
  c.slug as category_slug,
  CASE 
    WHEN p.category_id IS NULL THEN 'NEEDS CATEGORIZATION'
    ELSE 'CATEGORIZED'
  END as status
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
ORDER BY status DESC, p.name;

-- Step 2: Show products by category (for verification)
SELECT 
  c.name as category_name,
  c.slug as category_slug,
  COUNT(p.id) as product_count,
  STRING_AGG(p.name, ', ' ORDER BY p.name) as products
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.name, c.slug
ORDER BY c.sort_order;

-- Step 3: Show products that need categorization (NULL category_id)
SELECT 
  p.id,
  p.name,
  p.brand,
  p.description,
  'NEEDS MANUAL CATEGORIZATION OR DELETE' as action
FROM products p
WHERE p.category_id IS NULL
ORDER BY p.name;

-- Step 4: Show products in "accessories-other" category (potential candidates for deletion)
SELECT 
  p.id,
  p.name,
  p.brand,
  p.description,
  'IN ACCESSORIES-OTHER - Review for deletion' as recommendation
FROM products p
WHERE p.category_id IN (
  SELECT id FROM categories WHERE slug = 'accessories-other'
)
ORDER BY p.name;

-- Step 5: Update products to specific categories based on name/brand patterns
-- Use this section to manually categorize products by updating category_id

-- Example: Categorize iPhone products
/*
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'mobile-phones-iphone' LIMIT 1)
WHERE brand ILIKE '%apple%' 
  AND (name ILIKE '%iphone%' OR name ILIKE '%iPhone%')
  AND category_id IS NULL;
*/

-- Example: Categorize Samsung products
/*
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'mobile-phones-samsung' LIMIT 1)
WHERE brand ILIKE '%samsung%'
  AND category_id IS NULL;
*/

-- Example: Categorize based on product name patterns
/*
-- Battery products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'battery' LIMIT 1)
WHERE (name ILIKE '%battery%' OR description ILIKE '%battery%')
  AND category_id IS NULL;

-- Charger products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'charger' LIMIT 1)
WHERE (name ILIKE '%charger%' OR description ILIKE '%charger%')
  AND category_id IS NULL;

-- Power bank products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'power-bank' LIMIT 1)
WHERE (name ILIKE '%power%bank%' OR name ILIKE '%powerbank%' OR description ILIKE '%power bank%')
  AND category_id IS NULL;

-- Screen guard products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'screen-guard' LIMIT 1)
WHERE (name ILIKE '%screen%guard%' OR name ILIKE '%screen%protector%' OR description ILIKE '%screen guard%')
  AND category_id IS NULL;

-- Display products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'display' LIMIT 1)
WHERE (name ILIKE '%display%' OR name ILIKE '%screen%' OR description ILIKE '%display%')
  AND category_id IS NULL;

-- Handsfree/Earbuds products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'accessories-handsfree' LIMIT 1)
WHERE (name ILIKE '%earbud%' OR name ILIKE '%headphone%' OR name ILIKE '%headset%' 
       OR description ILIKE '%earbud%' OR description ILIKE '%headphone%')
  AND category_id IS NULL;

-- Cable products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'accessories-cables' LIMIT 1)
WHERE (name ILIKE '%cable%' OR name ILIKE '%data%transfer%' OR description ILIKE '%cable%')
  AND category_id IS NULL;

-- Case/Cover products
UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'accessories-cases' LIMIT 1)
WHERE (name ILIKE '%case%' OR name ILIKE '%cover%' OR description ILIKE '%case%')
  AND category_id IS NULL;
*/

-- Step 6: Identify products to delete (products that don't fit your main categories)
-- Products in accessories-other or with NULL category_id that don't match your business
SELECT 
  p.id,
  p.name,
  p.brand,
  c.name as current_category,
  'CONSIDER DELETING - Does not fit main categories (mobile phones, tablets, accessories)' as recommendation
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.category_id IS NULL
  OR (
    p.category_id IN (SELECT id FROM categories WHERE slug = 'accessories-other')
    AND (
      p.name ILIKE '%gaming%' 
      OR p.name ILIKE '%appliance%' 
      OR p.name ILIKE '%purifier%'
      OR p.name ILIKE '%vacuum%'
      OR p.name ILIKE '%security%'
      OR p.name ILIKE '%notebook%'
      OR p.name ILIKE '%laptop%'
      OR p.name ILIKE '%console%'
    )
  )
ORDER BY p.name;

-- Step 7: Delete products that don't fit (UNCOMMENT TO EXECUTE)
-- WARNING: This will permanently delete products. Review the list above first!
/*
DELETE FROM products
WHERE category_id IS NULL
  OR (
    category_id IN (SELECT id FROM categories WHERE slug = 'accessories-other')
    AND (
      name ILIKE '%gaming%' 
      OR name ILIKE '%appliance%' 
      OR name ILIKE '%purifier%'
      OR name ILIKE '%vacuum%'
      OR name ILIKE '%security%'
      OR name ILIKE '%notebook%'
      OR name ILIKE '%laptop%'
      OR name ILIKE '%console%'
    )
  );
*/

-- Step 8: Summary statistics
SELECT 
  'Total Products' as metric,
  COUNT(*)::text as value
FROM products
UNION ALL
SELECT 
  'Products with Category',
  COUNT(*)::text
FROM products
WHERE category_id IS NOT NULL
UNION ALL
SELECT 
  'Products without Category',
  COUNT(*)::text
FROM products
WHERE category_id IS NULL
UNION ALL
SELECT 
  'Products in Accessories-Other',
  COUNT(*)::text
FROM products
WHERE category_id IN (SELECT id FROM categories WHERE slug = 'accessories-other');
