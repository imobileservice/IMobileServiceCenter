-- Ensure variant_selected columns exist in cart_items and order_items
-- This migration is idempotent and safe to run multiple times

-- Add variant_selected column to cart_items if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cart_items' 
    AND column_name = 'variant_selected'
  ) THEN
    ALTER TABLE cart_items
    ADD COLUMN variant_selected JSONB DEFAULT NULL;
    
    COMMENT ON COLUMN cart_items.variant_selected IS 'Selected variant configuration for this cart item (storage, RAM, color)';
  END IF;
END $$;

-- Add variant_selected column to order_items if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_items' 
    AND column_name = 'variant_selected'
  ) THEN
    ALTER TABLE order_items
    ADD COLUMN variant_selected JSONB DEFAULT NULL;
    
    COMMENT ON COLUMN order_items.variant_selected IS 'Selected variant configuration for this order item (storage, RAM, color)';
  END IF;
END $$;

-- Ensure products.variants column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' 
    AND column_name = 'variants'
  ) THEN
    ALTER TABLE products
    ADD COLUMN variants JSONB DEFAULT NULL;
    
    COMMENT ON COLUMN products.variants IS 'Product variants (storage, RAM, color) with pricing and stock information';
  END IF;
END $$;

-- Create index for better query performance on variants (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN (variants);

