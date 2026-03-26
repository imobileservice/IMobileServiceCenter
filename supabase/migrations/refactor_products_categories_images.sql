-- Migration: Refactor Products to use category_id and separate images table
-- This migration:
-- 1. Creates product_images table for storing image URLs
-- 2. Adds category_id foreign key to products
-- 3. Migrates existing products to new category structure
-- 4. Removes old category text field

-- Step 1: Create product_images table
CREATE TABLE IF NOT EXISTS product_images (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  display_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_display_order ON product_images(display_order);
CREATE INDEX IF NOT EXISTS idx_product_images_is_primary ON product_images(is_primary);

-- Step 2: Add category_id column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Step 3: Migrate existing products to use category_id
-- Map old category slugs to new category IDs
DO $$
DECLARE
  cat_record RECORD;
  product_record RECORD;
  matched_category_id UUID;
  image_url TEXT;
  image_order INTEGER;
BEGIN
  -- Loop through all products and assign category_id based on category slug
  FOR product_record IN SELECT id, category FROM products WHERE category_id IS NULL LOOP
    -- Try to find matching category by slug
    SELECT id INTO matched_category_id 
    FROM categories 
    WHERE slug = product_record.category 
    LIMIT 1;
    
    -- If exact match not found, try to match subcategories
    IF matched_category_id IS NULL THEN
      -- Check if it's a subcategory (e.g., mobile-phones-iphone)
      IF product_record.category LIKE 'mobile-phones-%' THEN
        SELECT id INTO matched_category_id 
        FROM categories 
        WHERE slug = 'mobile-phones' 
        LIMIT 1;
      ELSIF product_record.category LIKE 'accessories-%' THEN
        SELECT id INTO matched_category_id 
        FROM categories 
        WHERE slug = 'accessories' 
        LIMIT 1;
      ELSIF product_record.category LIKE 'used-items-%' THEN
        SELECT id INTO matched_category_id 
        FROM categories 
        WHERE slug = 'used-items' 
        LIMIT 1;
      ELSE
        -- Try to find by partial match or default to first category
        SELECT id INTO matched_category_id 
        FROM categories 
        WHERE slug LIKE '%' || product_record.category || '%' 
        OR name ILIKE '%' || product_record.category || '%'
        LIMIT 1;
      END IF;
    END IF;
    
    -- Update product with category_id
    IF matched_category_id IS NOT NULL THEN
      UPDATE products 
      SET category_id = matched_category_id 
      WHERE id = product_record.id;
    ELSE
      -- If no match found, assign to first available category or leave NULL
      RAISE NOTICE 'Product % could not be matched to a category: %', product_record.id, product_record.category;
    END IF;
  END LOOP;
END $$;

-- Step 4: Migrate existing images to product_images table
DO $$
DECLARE
  product_record RECORD;
  image_url TEXT;
  image_order INTEGER;
  is_primary_flag BOOLEAN;
BEGIN
  FOR product_record IN 
    SELECT id, image, images 
    FROM products 
    WHERE image IS NOT NULL OR images IS NOT NULL
  LOOP
    image_order := 0;
    
    -- Migrate primary image (image field)
    IF product_record.image IS NOT NULL THEN
      INSERT INTO product_images (product_id, url, display_order, is_primary, alt_text)
      VALUES (
        product_record.id,
        product_record.image,
        0,
        true,
        'Primary product image'
      )
      ON CONFLICT DO NOTHING;
      image_order := 1;
    END IF;
    
    -- Migrate images array
    IF product_record.images IS NOT NULL AND array_length(product_record.images, 1) > 0 THEN
      FOR i IN 1..array_length(product_record.images, 1) LOOP
        image_url := product_record.images[i];
        
        -- Skip if this is the same as primary image
        IF image_url != product_record.image THEN
          is_primary_flag := (image_order = 0 AND product_record.image IS NULL);
          
          INSERT INTO product_images (product_id, url, display_order, is_primary, alt_text)
          VALUES (
            product_record.id,
            image_url,
            image_order,
            is_primary_flag,
            'Product image ' || image_order
          )
          ON CONFLICT DO NOTHING;
          
          image_order := image_order + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Step 5: Create a view for easy product queries with category and images
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

-- Step 6: Create function to get product images
CREATE OR REPLACE FUNCTION get_product_images(p_product_id UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  alt_text TEXT,
  display_order INTEGER,
  is_primary BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.id,
    pi.url,
    pi.alt_text,
    pi.display_order,
    pi.is_primary
  FROM product_images pi
  WHERE pi.product_id = p_product_id
  ORDER BY pi.display_order ASC, pi.is_primary DESC;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create function to add product with images
CREATE OR REPLACE FUNCTION add_product_with_images(
  p_name TEXT,
  p_description TEXT,
  p_price DECIMAL,
  p_stock INTEGER,
  p_category_slug TEXT,
  p_brand TEXT,
  p_condition TEXT,
  p_specs JSONB,
  p_image_urls TEXT[]
)
RETURNS UUID AS $$
DECLARE
  v_product_id UUID;
  v_category_id UUID;
  v_image_url TEXT;
  v_image_order INTEGER := 0;
BEGIN
  -- Get category_id from slug
  SELECT id INTO v_category_id
  FROM categories
  WHERE slug = p_category_slug
  LIMIT 1;
  
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: %', p_category_slug;
  END IF;
  
  -- Insert product
  INSERT INTO products (
    name, description, price, stock, category_id, brand, condition, specs
  ) VALUES (
    p_name, p_description, p_price, p_stock, v_category_id, p_brand, p_condition, p_specs
  ) RETURNING id INTO v_product_id;
  
  -- Insert images
  IF p_image_urls IS NOT NULL AND array_length(p_image_urls, 1) > 0 THEN
    FOREACH v_image_url IN ARRAY p_image_urls
    LOOP
      INSERT INTO product_images (product_id, url, display_order, is_primary, alt_text)
      VALUES (
        v_product_id,
        v_image_url,
        v_image_order,
        (v_image_order = 0),
        p_name || ' image ' || (v_image_order + 1)
      );
      v_image_order := v_image_order + 1;
    END LOOP;
  END IF;
  
  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Enable RLS on product_images
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view product images
CREATE POLICY "Product images are viewable by everyone" ON product_images
  FOR SELECT USING (true);

-- Policy: Only admins can manage product images
CREATE POLICY "Only admins can manage product images" ON product_images
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- Step 9: Add comments for documentation
COMMENT ON TABLE product_images IS 'Stores product image URLs separately for better organization and management';
COMMENT ON COLUMN products.category_id IS 'Foreign key reference to categories table. Replaces the old category text field.';
COMMENT ON FUNCTION get_product_images IS 'Returns all images for a given product ordered by display_order';
COMMENT ON FUNCTION add_product_with_images IS 'Helper function to add a product with multiple images in one transaction';

-- Note: We keep the old category and images fields temporarily for backward compatibility
-- You can remove them after verifying everything works:
-- ALTER TABLE products DROP COLUMN category;
-- ALTER TABLE products DROP COLUMN image;
-- ALTER TABLE products DROP COLUMN images;

