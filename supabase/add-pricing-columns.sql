-- Migration: Add buy_price, sell_price, and discount_price columns to products table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- Add new pricing columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS buy_price NUMERIC DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_price NUMERIC DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price NUMERIC DEFAULT NULL;

-- Backfill existing products: set sell_price = current price (so old products display correctly)
UPDATE products SET sell_price = price WHERE sell_price IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN products.buy_price IS 'Cost/purchase price of the product';
COMMENT ON COLUMN products.sell_price IS 'Regular selling price of the product';
COMMENT ON COLUMN products.discount_price IS 'Sale/promotional discounted price (optional)';
