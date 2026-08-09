-- ============================================================
-- ONE HOME FOR CASHIER ACCOUNTS (AND ONE FOR TILL ASSIGNMENTS)
-- ============================================================
--
-- Why POS login says "This till code is assigned to another cashier" when
-- nobody changed anything:
--
--   Two earlier migrations disagree about where a cashier lives.
--
--     20260805_split_cashiers_from_admins.sql  cashiers -> `cashiers` table,
--                                              pos_tills FK -> cashiers(id)
--     20260807_migrate_cashiers_into_admins.sql cashiers -> back into `admins`,
--                                              pos_tills FK -> admins(id)
--
--   The application never followed the second one. Cashier Management
--   (src/server/api/admin/cashiers.ts) still creates cashiers in `cashiers` and
--   writes a `cashiers`.id into pos_tills.assigned_cashier_id, while POS login
--   (src/server/api/cashier/login.ts) resolves the signing-in account from
--   `cashiers` first. So after 20260807 ran:
--
--     pos_tills.assigned_cashier_id  = the NEW admins.id
--     the account POS login found    = the OLD cashiers.id
--     login.ts compares the two      -> "assigned to another cashier"
--
--   Same account. Same till. Two different ids for one person, because the
--   person exists in two tables.
--
-- What this migration settles:
--
--   `cashiers` holds cashiers. `admins` holds administrators, and nothing else -
--   which is also what makes "only an admin can sign in to the admin panel"
--   true at the database level rather than only in code.
--   pos_tills.assigned_cashier_id points at cashiers(id), matching the code
--   that writes it.
--
-- Idempotent, and converges from either prior state - it does not matter which
-- of the two migrations above was last run against this database.

BEGIN;

-- 1. Make sure the cashiers table exists ----------------------------------
-- Normally created by 20260805. Repeated here so this migration stands alone.
CREATE TABLE IF NOT EXISTS cashiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT,
  shop        TEXT NOT NULL DEFAULT 'Meegoda',
  whatsapp    TEXT,
  role        TEXT NOT NULL DEFAULT 'cashier',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cashiers DROP CONSTRAINT IF EXISTS cashiers_role_cashier_only;
ALTER TABLE cashiers ADD CONSTRAINT cashiers_role_cashier_only CHECK (role = 'cashier');

-- RLS on with no policies, matching `admins`: the anon key shipped in the
-- frontend must never be able to read a password column.
ALTER TABLE cashiers ENABLE ROW LEVEL SECURITY;

-- 2. Bring any cashier parked in `admins` across --------------------------
-- The id is carried over when it is free, so a till already pointing at it
-- stays valid without any further work. An email that already has a cashiers
-- row is skipped: that row is the one POS login resolves, so it wins, and
-- step 4 repoints the till onto it.
INSERT INTO cashiers (id, email, password, name, shop, whatsapp, role, created_at)
SELECT
  a.id,
  lower(a.email),
  a.password,
  COALESCE(a.name, split_part(a.email, '@', 1)),
  COALESCE(a.shop, 'Meegoda'),
  a.whatsapp,
  'cashier',
  a.created_at
FROM admins a
WHERE lower(a.role) = 'cashier'
  AND NOT EXISTS (
    SELECT 1 FROM cashiers c
    WHERE c.id = a.id OR lower(c.email) = lower(a.email)
  );

-- 3. Release the foreign key before moving any ids ------------------------
-- Dropped by lookup rather than by name: 20260805 and 20260807 both created a
-- constraint called pos_tills_assigned_cashier_id_fkey but pointed it at
-- different tables, and an older database may carry a differently named one.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = src.relnamespace
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND src.relname = 'pos_tills'
      AND EXISTS (
        SELECT 1 FROM unnest(c.conkey) k
        JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k
        WHERE att.attname = 'assigned_cashier_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.pos_tills DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Dropped % on pos_tills.assigned_cashier_id', r.conname;
  END LOOP;
END $$;

-- 4. Repoint till assignments from the admins id to the cashiers id -------
-- This is the line that fixes the reported error. Matched on email, because
-- that is the only thing the same person shares across the two tables.
UPDATE pos_tills t
SET assigned_cashier_id = c.id,
    updated_at = now()
FROM admins a
JOIN cashiers c ON lower(c.email) = lower(a.email)
WHERE t.assigned_cashier_id = a.id
  AND c.id <> a.id;

-- 5. Clear assignments that resolve to nobody -----------------------------
-- Anything still pointing outside `cashiers` is either a deleted account or an
-- administrator (an admin cannot be a cashier row). Both must be cleared or the
-- foreign key below cannot be created.
--
-- An administrator loses their named assignment here, but does NOT lose access:
-- login.ts only enforces the assignment for role='cashier', so an admin can
-- still open an unassigned till. Reassign it in Cashier Management if you want
-- the till locked to a specific cashier again.
UPDATE pos_tills
SET assigned_cashier_id = NULL,
    updated_at = now()
WHERE assigned_cashier_id IS NOT NULL
  AND assigned_cashier_id NOT IN (SELECT id FROM cashiers);

-- 6. Re-add the key, pointing where the application writes ----------------
ALTER TABLE pos_tills
  ADD CONSTRAINT pos_tills_assigned_cashier_id_fkey
  FOREIGN KEY (assigned_cashier_id)
  REFERENCES cashiers(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_tills_assigned_cashier
  ON pos_tills(assigned_cashier_id);

-- 7. `admins` means administrator again ------------------------------------
-- Their cashier login is untouched - step 2 copied it, password hash and all,
-- into the table POS login actually reads.
DELETE FROM admins WHERE lower(role) = 'cashier';

-- Also normalises the stray 'Admin' capitalisation. Every role check in the
-- server compares against lower-case 'admin'.
UPDATE admins SET role = 'admin' WHERE role IS NULL OR lower(role) <> 'admin';

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_admin_only;
ALTER TABLE admins ADD CONSTRAINT admins_role_admin_only CHECK (role = 'admin');

-- An ambiguous email would let the admin panel and the POS disagree about who
-- is signing in. Enforced on both sides.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email_unique ON admins (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashiers_email_unique ON cashiers (lower(email));

COMMIT;

-- ------------------------------------------------------------
-- Verify - expect administrators only in the first list, every cashier in the
-- second, and every active till resolving to a name in the third.
-- ------------------------------------------------------------
-- SELECT email, role FROM admins ORDER BY email;
-- SELECT email, name, role, shop FROM cashiers ORDER BY email;
-- SELECT t.code_hint, t.shop, t.status, c.email AS assigned_to
-- FROM pos_tills t
-- LEFT JOIN cashiers c ON c.id = t.assigned_cashier_id
-- ORDER BY t.code_hint;

-- No email should appear in both tables. Expect zero rows:
-- SELECT a.email FROM admins a JOIN cashiers c ON lower(c.email) = lower(a.email);
