-- Update product variants structure to support price adjustments
-- New structure:
-- {
--   "base_price": 100000,
--   "storage": [
--     {"value": "128GB", "price_adjustment": 0, "stock": 10},
--     {"value": "256GB", "price_adjustment": 5000, "stock": 8},
--     {"value": "512GB", "price_adjustment": 10000, "stock": 5}
--   ],
--   "ram": [
--     {"value": "8GB", "price_adjustment": 0, "stock": 10},
--     {"value": "12GB", "price_adjustment": 5000, "stock": 5}
--   ],
--   "color": [
--     {"value": "Black", "hex": "#000000", "image": "/product-black.jpg", "stock": 10},
--     {"value": "Blue", "hex": "#0066CC", "image": "/product-blue.jpg", "stock": 8}
--   ]
-- }

-- Note: This migration doesn't modify existing data, just documents the new structure
-- The variants column already exists from add_product_variants.sql

COMMENT ON COLUMN products.variants IS 'Product variants with price adjustments. Structure: {base_price: number, storage: [{value, price_adjustment, stock}], ram: [{value, price_adjustment, stock}], color: [{value, hex, image, stock}]}';

