-- ============================================================
-- SHARED STOCK: one physical part listed as several products
-- ============================================================
-- "Narzo 20 Display" is the same part as "Oppo A17K Display". The admin adds
-- it as its own product (own name, barcode and price) and picks the product
-- whose stock it shares. Both inv_stock rows then always hold the same counts:
-- a POS sale, return, restock or edit on either one is copied to the other.
--
-- A group is one main product plus every product whose stock_source_id points
-- at it. Groups are kept one level deep.
--
-- Safe to run more than once.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_source_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_stock_source ON products(stock_source_id);

-- ------------------------------------------------------------
-- Link to the group's main product, never to itself or a chain.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_stock_source()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_source_id IS NOT NULL THEN
    SELECT COALESCE(p.stock_source_id, p.id) INTO NEW.stock_source_id
    FROM products p
    WHERE p.id = NEW.stock_source_id;

    IF NEW.stock_source_id = NEW.id THEN
      NEW.stock_source_id := NULL;
    ELSIF EXISTS (SELECT 1 FROM products WHERE stock_source_id = NEW.id) THEN
      RAISE EXCEPTION 'Other products already share this product''s stock, so it cannot share another product''s stock';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_stock_source ON products;
CREATE TRIGGER trg_normalize_stock_source
  BEFORE INSERT OR UPDATE OF stock_source_id ON products
  FOR EACH ROW
  EXECUTE FUNCTION normalize_stock_source();

-- ------------------------------------------------------------
-- Linking copies the main product's stock onto the linked product.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_shared_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_source_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.stock_source_id IS DISTINCT FROM NEW.stock_source_id) THEN
    INSERT INTO inv_stock (product_id, qty_meegoda, qty_padukka, qty_padukka_new, damaged_quantity, low_stock_threshold)
    SELECT NEW.id, s.qty_meegoda, s.qty_padukka, s.qty_padukka_new, s.damaged_quantity, 5
    FROM inv_stock s
    WHERE s.product_id = NEW.stock_source_id
    ON CONFLICT (product_id) DO UPDATE SET
      qty_meegoda = EXCLUDED.qty_meegoda,
      qty_padukka = EXCLUDED.qty_padukka,
      qty_padukka_new = EXCLUDED.qty_padukka_new,
      damaged_quantity = EXCLUDED.damaged_quantity,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_shared_stock ON products;
CREATE TRIGGER trg_link_shared_stock
  AFTER INSERT OR UPDATE OF stock_source_id ON products
  FOR EACH ROW
  EXECUTE FUNCTION link_shared_stock();

-- ------------------------------------------------------------
-- Every stock change on one product of a group is copied to the rest.
-- Rows that already match are skipped, so the copies do not echo back.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mirror_shared_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root UUID;
BEGIN
  IF NEW.qty_meegoda IS NOT DISTINCT FROM OLD.qty_meegoda
     AND NEW.qty_padukka IS NOT DISTINCT FROM OLD.qty_padukka
     AND NEW.qty_padukka_new IS NOT DISTINCT FROM OLD.qty_padukka_new
     AND NEW.damaged_quantity IS NOT DISTINCT FROM OLD.damaged_quantity THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(stock_source_id, id) INTO v_root FROM products WHERE id = NEW.product_id;
  IF v_root IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE inv_stock s SET
    qty_meegoda = NEW.qty_meegoda,
    qty_padukka = NEW.qty_padukka,
    qty_padukka_new = NEW.qty_padukka_new,
    damaged_quantity = NEW.damaged_quantity,
    quantity = NEW.quantity,
    updated_at = now()
  FROM products p
  WHERE s.product_id = p.id
    AND p.id <> NEW.product_id
    AND (p.id = v_root OR p.stock_source_id = v_root)
    AND (s.qty_meegoda, s.qty_padukka, s.qty_padukka_new, s.damaged_quantity)
        IS DISTINCT FROM (NEW.qty_meegoda, NEW.qty_padukka, NEW.qty_padukka_new, NEW.damaged_quantity);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mirror_shared_stock ON inv_stock;
CREATE TRIGGER trg_mirror_shared_stock
  AFTER UPDATE OF qty_meegoda, qty_padukka, qty_padukka_new, damaged_quantity ON inv_stock
  FOR EACH ROW
  EXECUTE FUNCTION mirror_shared_stock();

NOTIFY pgrst, 'reload schema';
