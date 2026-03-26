-- Add product variants support
-- This migration adds variant pricing support to products table

-- Add variants column to products table to store variant configurations
-- Variants will be stored as JSONB with structure:
-- {
--   "storage": [
--     {"value": "128GB", "price": 249000, "stock": 10},
--     {"value": "256GB", "price": 279000, "stock": 8}
--   ],
--   "ram": [
--     {"value": "8GB", "price": 0, "stock": 10},
--     {"value": "12GB", "price": 20000, "stock": 5}
--   ],
--   "color": [
--     {"value": "Black", "image": "/product-black.jpg", "stock": 10},
--     {"value": "Blue", "image": "/product-blue.jpg", "stock": 8}
--   ]
-- }
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL;

-- Add variant_selected column to cart_items to store selected variant
ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS variant_selected JSONB DEFAULT NULL;

-- Add variant_selected column to order_items to store selected variant
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS variant_selected JSONB DEFAULT NULL;

-- Create index for better query performance on variants
CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN (variants);

-- Comment on columns
COMMENT ON COLUMN products.variants IS 'Product variants (storage, RAM, color) with pricing and stock information';
COMMENT ON COLUMN cart_items.variant_selected IS 'Selected variant configuration for this cart item';
COMMENT ON COLUMN order_items.variant_selected IS 'Selected variant configuration for this order item';

