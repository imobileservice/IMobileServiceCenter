-- ============================================================
-- REVERSE SYNC TRIGGER: products.stock → inv_stock.quantity
-- Ensures manual edits in Products page sync to Inventory module
-- ============================================================

CREATE OR REPLACE FUNCTION sync_inv_stock_from_product()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if stock column was actually updated and changed
  IF (OLD.stock IS DISTINCT FROM NEW.stock) THEN
    -- Update existing record
    UPDATE inv_stock 
    SET quantity = NEW.stock, 
        updated_at = now()
    WHERE product_id = NEW.id;
    
    -- If no record exists, auto_init_inv_stock trigger (if any) will handle it, 
    -- but usually it should exist.
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_inv_stock_from_product ON products;
CREATE TRIGGER trg_sync_inv_stock_from_product
  AFTER UPDATE OF stock ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_inv_stock_from_product();
