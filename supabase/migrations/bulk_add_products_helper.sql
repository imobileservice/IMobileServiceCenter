-- Helper script for bulk adding products with images
-- This provides example queries and functions for adding multiple products

-- Example: Add a product with multiple images
-- SELECT add_product_with_images(
--   'iPhone 15 Pro Max 256GB',
--   'Latest iPhone with A17 Pro chip, 256GB storage, Titanium design',
--   249000.00,
--   10,
--   'mobile-phones-iphone',  -- category slug
--   'Apple',
--   'new',
--   '{"storage": "256GB", "ram": "8GB", "color": "Titanium Blue, Black, White", "warranty": "Company Warranty"}'::jsonb,
--   ARRAY[
--     'https://example.com/images/iphone-15-pro-max-1.jpg',
--     'https://example.com/images/iphone-15-pro-max-2.jpg',
--     'https://example.com/images/iphone-15-pro-max-3.jpg'
--   ]
-- );

-- Function to bulk add products from JSON array
CREATE OR REPLACE FUNCTION bulk_add_products(p_products JSONB)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  product_item JSONB;
  v_product_id UUID;
  v_error TEXT;
BEGIN
  FOR product_item IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    BEGIN
      SELECT add_product_with_images(
        product_item->>'name',
        product_item->>'description',
        (product_item->>'price')::DECIMAL,
        COALESCE((product_item->>'stock')::INTEGER, 0),
        product_item->>'category_slug',
        product_item->>'brand',
        COALESCE(product_item->>'condition', 'new'),
        COALESCE((product_item->>'specs')::JSONB, '{}'::JSONB),
        (SELECT ARRAY(SELECT jsonb_array_elements_text(product_item->'image_urls')))
      ) INTO v_product_id;
      
      RETURN QUERY SELECT v_product_id, product_item->>'name', true, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT NULL::UUID, product_item->>'name', false, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Example usage of bulk_add_products:
/*
SELECT * FROM bulk_add_products('[
  {
    "name": "Samsung Galaxy S25 Ultra",
    "description": "Premium Android phone with S Pen, 512GB storage",
    "price": 274900.00,
    "stock": 8,
    "category_slug": "mobile-phones-samsung",
    "brand": "Samsung",
    "condition": "new",
    "specs": {"storage": "512GB", "ram": "12GB", "color": "Black, Blue, Green, Pink, White"},
    "image_urls": [
      "https://example.com/images/samsung-s25-ultra-1.jpg",
      "https://example.com/images/samsung-s25-ultra-2.jpg",
      "https://example.com/images/samsung-s25-ultra-3.jpg"
    ]
  },
  {
    "name": "iPhone 15 Pro",
    "description": "Latest iPhone with A17 Pro chip",
    "price": 199000.00,
    "stock": 15,
    "category_slug": "mobile-phones-iphone",
    "brand": "Apple",
    "condition": "new",
    "specs": {"storage": "256GB", "ram": "8GB", "color": "Titanium, Blue, Black"},
    "image_urls": [
      "https://example.com/images/iphone-15-pro-1.jpg",
      "https://example.com/images/iphone-15-pro-2.jpg"
    ]
  }
]'::JSONB);
*/

-- Function to add images to existing product
CREATE OR REPLACE FUNCTION add_images_to_product(
  p_product_id UUID,
  p_image_urls TEXT[]
)
RETURNS INTEGER AS $$
DECLARE
  v_image_url TEXT;
  v_image_order INTEGER;
  v_count INTEGER := 0;
BEGIN
  -- Get current max display_order
  SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_image_order
  FROM product_images
  WHERE product_id = p_product_id;
  
  -- Add each image
  FOREACH v_image_url IN ARRAY p_image_urls
  LOOP
    INSERT INTO product_images (product_id, url, display_order, is_primary, alt_text)
    VALUES (
      p_product_id,
      v_image_url,
      v_image_order,
      false,  -- Don't set as primary automatically
      'Product image ' || v_image_order
    );
    v_image_order := v_image_order + 1;
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update product primary image
CREATE OR REPLACE FUNCTION set_primary_image(
  p_product_id UUID,
  p_image_url TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_image_id UUID;
BEGIN
  -- Find image by URL
  SELECT id INTO v_image_id
  FROM product_images
  WHERE product_id = p_product_id AND url = p_image_url
  LIMIT 1;
  
  IF v_image_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Unset all primary images for this product
  UPDATE product_images
  SET is_primary = false
  WHERE product_id = p_product_id;
  
  -- Set this image as primary
  UPDATE product_images
  SET is_primary = true
  WHERE id = v_image_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION bulk_add_products IS 'Bulk add multiple products from JSON array. Returns success status for each product.';
COMMENT ON FUNCTION add_images_to_product IS 'Add multiple images to an existing product';
COMMENT ON FUNCTION set_primary_image IS 'Set a specific image as the primary image for a product';

