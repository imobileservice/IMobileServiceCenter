-- ============================================================
-- MIGRATE CASHIER ACCOUNTS INTO `admins` AND FIX TILL ASSIGNMENTS
--
-- Problem this fixes:
--   POS login (src/server/api/cashier/login.ts) authenticates against
--   `admins` WHERE role IN ('cashier','admin'). But a CHECK constraint
--   `admins_role_admin_only` forbade role='cashier', so cashier accounts
--   were parked in a standalone `cashiers` table that NO code reads.
--   pos_tills.assigned_cashier_id was then wired to `cashiers.id` - both by
--   its data and by a foreign key pointing at `cashiers` - so the till
--   ownership check at login.ts:149 could never match a logged-in account.
--
--   Symptoms:
--     hashankavishka703@gmail.com  -> "Invalid email or password"
--     dexlanka@gmail.com + MEG-01  -> "This till code is assigned to another cashier"
--
-- Run this in the Supabase SQL Editor. It is idempotent.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Allow role='cashier' on admins (this is the actual blocker)
-- ------------------------------------------------------------
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_admin_only;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;

ALTER TABLE admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('admin', 'cashier'));

-- Emails must be unique for login to be unambiguous; login.ts:94 uses
-- .single() and errors out on duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email_unique ON admins (email);

-- ------------------------------------------------------------
-- 2. Drop every foreign key that points at the retired `cashiers` table.
--
--    pos_tills.assigned_cashier_id definitely has one. pos_till_sessions
--    and pos_auth_events plausibly do too - if so they would break POS
--    login later, at session creation (login.ts:207), once those columns
--    start carrying `admins` ids.
--
--    This MUST run before steps 3-4 - otherwise the old FK rejects the new
--    `admins` ids with:
--      23503 ... Key (assigned_cashier_id)=(...) is not present in table "cashiers"
--
--    Discovered by lookup rather than by name: constraint names are not
--    guaranteed, and any FK onto `cashiers` is dead by definition once its
--    ids no longer refer to anything the app reads.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  dropped INT := 0;
BEGIN
  FOR r IN
    SELECT c.conname, src.relname AS src_table
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = tgt.relnamespace
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND tgt.relname = 'cashiers'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.src_table, r.conname);
    RAISE NOTICE 'Dropped % on %, which referenced cashiers', r.conname, r.src_table;
    dropped := dropped + 1;
  END LOOP;

  RAISE NOTICE 'Total foreign keys onto cashiers removed: %', dropped;
END $$;

-- ------------------------------------------------------------
-- 3. Create the cashier accounts POS login actually reads.
--    Passwords are scrypt hashes in the exact format produced by
--    hashPassword() in src/server/api/utils/password.ts:
--        scrypt$<16-byte hex salt>$<64-byte hex scryptSync(pw, salt, 64)>
--    Plaintext equivalents (carried over from the legacy `cashiers` table):
--        hashankavishka703@gmail.com -> imobilemeegoda
--        dgtnuwankumara@gmail.com    -> imobilepadukka
--
--    dexlanka@gmail.com is deliberately NOT inserted: it already exists
--    in `admins` as role='admin' (id 3b298029-...). It keeps its existing
--    admin password; the legacy cashiers-row password '123456' is dropped.
-- ------------------------------------------------------------
INSERT INTO admins (email, password, name, role, shop)
SELECT v.email, v.password, v.name, v.role, v.shop
FROM (VALUES
  ('hashankavishka703@gmail.com',
   'scrypt$3e834d9b2da23becb5649bea6e81d61a$c51bbe7d9f11a59266417ce46650970a7259d1a5bc574aa7c08568d87fa2f70faca3619ef068001853a57bc5438ca4e437288f7d89765c019658a8e8b7dbe93a',
   'Hashan Kavishka', 'cashier', 'Meegoda'),
  ('dgtnuwankumara@gmail.com',
   'scrypt$1f373637655ec6bfddabfe5e9bca5c27$b252eab6ebd4db5f3705b07b89b495d4caed1cc469b4fbc79d546141aebb455c38a287e22e600a14314d7e516dddf60f1916f555d4690e1f8f14c0d81970a403',
   'Nuwan Kumara', 'cashier', 'Padukka')
) AS v(email, password, name, role, shop)
WHERE NOT EXISTS (SELECT 1 FROM admins a WHERE a.email = v.email);

-- If a rerun finds them already present, keep name/role/shop authoritative
-- without touching the stored password.
UPDATE admins SET name = 'Hashan Kavishka', role = 'cashier', shop = 'Meegoda'
WHERE email = 'hashankavishka703@gmail.com';

UPDATE admins SET name = 'Nuwan Kumara', role = 'cashier', shop = 'Padukka'
WHERE email = 'dgtnuwankumara@gmail.com';

-- ------------------------------------------------------------
-- 4. Repoint till assignments at the `admins` ids.
--    login.ts:188 also requires till.shop = cashier.shop, so shop is set
--    together with the assignment.
-- ------------------------------------------------------------
UPDATE pos_tills t SET
  assigned_cashier_id = a.id,
  shop = a.shop,
  updated_at = now()
FROM admins a
WHERE a.email = 'hashankavishka703@gmail.com'
  AND t.code_hint = 'MEG-01';

UPDATE pos_tills t SET
  assigned_cashier_id = a.id,
  shop = a.shop,
  updated_at = now()
FROM admins a
WHERE a.email = 'dexlanka@gmail.com'
  AND t.code_hint = 'MEG-02';

UPDATE pos_tills t SET
  assigned_cashier_id = a.id,
  shop = a.shop,
  updated_at = now()
FROM admins a
WHERE a.email = 'dgtnuwankumara@gmail.com'
  AND t.code_hint = 'PAD-01';

-- Clear any assignment still pointing outside `admins`, otherwise the
-- foreign key below cannot be created.
UPDATE pos_tills SET assigned_cashier_id = NULL
WHERE assigned_cashier_id IS NOT NULL
  AND assigned_cashier_id NOT IN (SELECT id FROM admins);

-- ------------------------------------------------------------
-- 5. Re-add the foreign key, now pointing at `admins`, so assignments can
--    never drift to another table's ids again.
--
--    The DROP keeps reruns working: on a second pass step 2 finds nothing
--    (the FK already points at `admins`, not `cashiers`), so without this
--    the ADD below would fail on the duplicate constraint name.
-- ------------------------------------------------------------
ALTER TABLE pos_tills DROP CONSTRAINT IF EXISTS pos_tills_assigned_cashier_id_fkey;

ALTER TABLE pos_tills
  ADD CONSTRAINT pos_tills_assigned_cashier_id_fkey
  FOREIGN KEY (assigned_cashier_id)
  REFERENCES admins(id)
  ON DELETE SET NULL;

COMMIT;

-- ------------------------------------------------------------
-- Verification - expect 2 cashiers, and MEG-01/MEG-02/PAD-01 assigned.
-- ------------------------------------------------------------
SELECT email, name, role, shop FROM admins ORDER BY role, email;

SELECT t.code_hint, t.shop, t.status, a.email AS assigned_to
FROM pos_tills t
LEFT JOIN admins a ON a.id = t.assigned_cashier_id
ORDER BY t.code_hint;


-- ============================================================
-- OPTIONAL, run separately once POS login is confirmed working.
-- The legacy `cashiers` table is read by no code at all; leaving it in
-- place is what made this look like a "missing till_code column".
-- Nothing references it once step 2 above has run.
-- Renaming (not dropping) keeps the original rows recoverable.
-- ============================================================
-- ALTER TABLE IF EXISTS cashiers RENAME TO cashiers_legacy_backup;
-- COMMENT ON TABLE cashiers_legacy_backup IS
--   'Unused as of 2026-08-07. Cashier accounts now live in admins (role=''cashier'').';
