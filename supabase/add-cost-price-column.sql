-- Migration: Add cost_price (Buy Price) column to products table
-- Run this in your Supabase SQL Editor

-- Add cost_price column (supplier/purchase cost)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.cost_price IS 'Supplier/purchase cost price of the product';
