-- ============================================================
-- ASSIGN POS TILL CODES TO CASHIER ACCOUNTS
-- A till code can be used only by the assigned cashier.
-- ============================================================

ALTER TABLE pos_tills
ADD COLUMN IF NOT EXISTS assigned_cashier_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_tills_assigned_cashier_id_fkey'
  ) THEN
    ALTER TABLE pos_tills
    ADD CONSTRAINT pos_tills_assigned_cashier_id_fkey
    FOREIGN KEY (assigned_cashier_id)
    REFERENCES admins(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_tills_assigned_cashier
ON pos_tills(assigned_cashier_id);

COMMENT ON COLUMN pos_tills.assigned_cashier_id IS
'Cashier account that is allowed to use this POS till code.';
