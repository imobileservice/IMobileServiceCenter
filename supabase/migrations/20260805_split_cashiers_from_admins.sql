-- ============================================================
-- SPLIT CASHIERS OUT OF THE admins TABLE
-- ============================================================
--
-- Until now a cashier was just a row in `admins` carrying role='cashier'.
-- Nothing in the admin login checked that role, so a cashier's credentials
-- passed the admin panel's password step and the server emailed them a
-- one-time code. The role column was the only thing separating a shop cashier
-- from a full administrator, and one missing `.eq('role', ...)` was enough to
-- erase that line.
--
-- After this migration the separation is structural: `admins` holds
-- administrators only, `cashiers` holds POS staff only, and the admin login
-- reads a table that physically cannot contain a cashier.
--
-- ORDER MATTERS. pos_tills.assigned_cashier_id points at admins(id) with
-- ON DELETE SET NULL, so deleting the cashier rows before the foreign key is
-- repointed would silently unassign every till code. Rows are copied and the
-- key is moved first, and the ids are carried across unchanged so existing
-- pos_tills / pos_till_sessions / pos_auth_events references stay valid.
--
-- Safe to run more than once.

BEGIN;

-- 1. The cashiers table -------------------------------------------------
-- `role` is kept, fixed to 'cashier', so the /api/admin/cashiers responses
-- keep the exact shape the admin UI already reads.
CREATE TABLE IF NOT EXISTS cashiers (
  -- gen_random_uuid() is built into Postgres 13+, so this default does not
  -- depend on the uuid-ossp extension being present. It is what generates the
  -- id for a cashier created through the admin panel.
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

-- Matches how `admins` is protected: RLS on with no policies, so the anon and
-- authenticated keys can read nothing. Only the service role key, which
-- bypasses RLS, reaches this table - and it lives on the server alone.
-- Without this the anon key shipped in the frontend could read password values.
ALTER TABLE cashiers ENABLE ROW LEVEL SECURITY;

-- 2. Move the cashier rows across, ids intact ----------------------------
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
ON CONFLICT (id) DO NOTHING;

-- 3. Repoint the till foreign key BEFORE anything is deleted -------------
-- A till assigned to a non-cashier account was never valid (the API only ever
-- assigns rows with role='cashier'), and such a row would abort the ALTER
-- below. Clear those first so the migration cannot get stuck half applied.
UPDATE pos_tills
SET assigned_cashier_id = NULL
WHERE assigned_cashier_id IS NOT NULL
  AND assigned_cashier_id NOT IN (SELECT id FROM cashiers);

ALTER TABLE pos_tills DROP CONSTRAINT IF EXISTS pos_tills_assigned_cashier_id_fkey;
ALTER TABLE pos_tills
  ADD CONSTRAINT pos_tills_assigned_cashier_id_fkey
  FOREIGN KEY (assigned_cashier_id)
  REFERENCES cashiers(id)
  ON DELETE SET NULL;

-- pos_till_sessions.cashier_id and pos_auth_events.cashier_id intentionally
-- carry no foreign key: an administrator may also open a till, so those
-- columns hold an id from either table.

-- 4. admins now means administrator ---------------------------------------
DELETE FROM admins WHERE lower(role) = 'cashier';

-- Also normalises the stray 'Admin' capitalisation, which every role check in
-- the server compares case-sensitively against 'admin'.
UPDATE admins SET role = 'admin' WHERE role IS NULL OR role <> 'admin';

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_admin_only;
ALTER TABLE admins ADD CONSTRAINT admins_role_admin_only CHECK (role = 'admin');

COMMIT;

-- Verify:
--   SELECT email, role FROM admins ORDER BY email;    -- administrators only
--   SELECT email, role, shop FROM cashiers ORDER BY email;
--   SELECT code_hint, assigned_cashier_id FROM pos_tills;  -- assignments intact
