-- Migration: Remove old category and image fields from products table
-- WARNING: Only run this after verifying that category_id and product_images are working correctly
-- This migration removes the old text-based category field and image fields

-- Step 1: Ensure all products have category_id (set default if NULL)
UPDATE products 
SET category_id = (SELECT id FROM categories WHERE slug = 'display' LIMIT 1)
WHERE category_id IS NULL;

-- Step 2: Make category_id NOT NULL
ALTER TABLE products 
ALTER COLUMN category_id SET NOT NULL;

-- Step 3: Remove old category text field
ALTER TABLE products 
DROP COLUMN IF EXISTS category;

-- Step 4: Remove old image fields (images are now in product_images table)
ALTER TABLE products 
DROP COLUMN IF EXISTS image;

ALTER TABLE products 
DROP COLUMN IF EXISTS images;

-- Step 5: Add index on category_id for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- Step 6: Update the view to remove references to old fields
CREATE OR REPLACE VIEW products_with_details AS
SELECT 
  p.id,
  p.name,
  p.description,
  p.price,
  p.stock,
  p.brand,
  p.condition,
  p.specs,
  p.rating,
  p.reviews_count,
  p.created_at,
  p.updated_at,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  (
    SELECT url 
    FROM product_images 
    WHERE product_id = p.id AND is_primary = true 
    LIMIT 1
  ) as primary_image,
  (
    SELECT ARRAY_AGG(url ORDER BY display_order)
    FROM product_images
    WHERE product_id = p.id
  ) as images_array
FROM products p
LEFT JOIN categories c ON p.category_id = c.id;

