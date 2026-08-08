-- ============================================================
-- SUPPLIER PORTAL
-- ============================================================
--
-- Gives suppliers their own sign-in at /supplier/login, separate from the admin
-- panel. A supplier sees only the products you assigned to them - which are out,
-- which are low, and how many units you want - and answers each line with
-- "can supply" or "not available" plus an expected date.
--
-- Nothing here changes what the admin side already does. /admin/suppliers keeps
-- full control; this only adds credentials, a session store and a replies table.
--
-- Safe to run more than once.

BEGIN;

-- 1. Portal credentials on the supplier record ---------------------------
-- The login lives on inv_suppliers rather than a separate accounts table
-- because one supplier is one login. inv_suppliers.email already exists and is
-- reused as the username.
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS portal_password TEXT;
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMPTZ;

-- Two suppliers sharing an email would make a login ambiguous - whoever the
-- query happened to return first would win. Enforced only over rows that can
-- actually sign in, so your existing records are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_suppliers_portal_email
  ON inv_suppliers (lower(email))
  WHERE portal_enabled AND email IS NOT NULL;

-- 2. Sessions ------------------------------------------------------------
-- Only the SHA-256 hash is stored, so a leaked table dump cannot be replayed as
-- a login - the same approach pos_till_sessions already uses for the POS.
CREATE TABLE IF NOT EXISTS supplier_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES inv_suppliers(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_sessions_supplier ON supplier_sessions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_expires ON supplier_sessions(expires_at);

-- 3. What the supplier answers -------------------------------------------
-- One row per supplier per product, overwritten as they change their mind.
CREATE TABLE IF NOT EXISTS inv_supplier_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    UUID NOT NULL REFERENCES inv_suppliers(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  available_qty  INTEGER,
  expected_date  DATE,
  note           TEXT,
  responded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inv_supplier_responses_status_check
    CHECK (status IN ('pending', 'can_supply', 'unavailable')),
  CONSTRAINT inv_supplier_responses_unique UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier_responses_supplier
  ON inv_supplier_responses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier_responses_product
  ON inv_supplier_responses(product_id);

-- 4. Lock the new tables down --------------------------------------------
-- RLS on with no policies, matching admins/cashiers: the anon key shipped in
-- the frontend can read nothing here. Every read goes through the server on the
-- service-role key, which is also where the supplier's own id is pinned to
-- their session - a supplier must never be able to name someone else's id.
ALTER TABLE supplier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_supplier_responses ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify:
--   SELECT name, email, portal_enabled FROM inv_suppliers ORDER BY name;
--   SELECT COUNT(*) FROM supplier_sessions;
--   SELECT COUNT(*) FROM inv_supplier_responses;
