-- Migration: Add qty_label (custom quantity label) column to products table
-- Run this in your Supabase SQL Editor

-- Optional free-text label shown next to Stock in the admin Products table.
-- Only used for items that are always sold/stocked in a fixed unit,
-- e.g. "Box of 25", "Pair", "Set of 4", "1 Pack". NULL = no label.
ALTER TABLE products ADD COLUMN IF NOT EXISTS qty_label TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.qty_label IS 'Optional fixed quantity label for the product (e.g. "Box of 25", "Pair"). NULL when the product has no special qty unit.';
