-- ============================================================
-- ASSISTANT ADMIN ACCOUNTS
-- ============================================================
--
-- A second, deliberately small administrator role.
--
-- An assistant admin may:
--   * create products and categories
--   * manage inventory (stock levels / thresholds)
--   * see product, stock and category figures on their own dashboard
--
-- An assistant admin may NOT edit or delete anything on their own. Those two
-- actions are recorded as a REQUEST (assistant_admin_requests) and only take
-- effect when a full administrator approves them. Nothing else in the panel -
-- orders, customers, revenue, messages, suppliers, cashiers, settings - is
-- reachable, and the server enforces that per route, not the sidebar.
--
-- Why a separate table rather than a role on `admins`:
--   20260811_consolidate_cashier_accounts.sql pinned admins.role to 'admin'
--   with a CHECK, precisely so "in the admins table" means "full
--   administrator". Adding a weaker role to that table would undo the property
--   the whole login path (authenticateAdmin) leans on. Cashiers were split out
--   for the same reason; assistants follow the same shape.
--
-- Every table here is service_role only: RLS is on with no policy, so the anon
-- key shipped in the browser can never read a password hash, a session token
-- or a one-time code.
--
-- Safe to run more than once.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. The accounts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_admins (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  password              TEXT NOT NULL,             -- scrypt, see utils/password.ts
  name                  TEXT,
  whatsapp              TEXT,
  role                  TEXT NOT NULL DEFAULT 'assistant_admin',

  -- Email ownership must be proven before the account can be used at all.
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at     TIMESTAMPTZ,

  -- 'pending'   - created, email not verified yet
  -- 'active'    - may sign in
  -- 'suspended' - blocked by an administrator, sessions revoked
  status                TEXT NOT NULL DEFAULT 'pending',

  -- Per-capability switches an administrator can turn off individually.
  -- Absent key = denied. The server treats this as the whole permission set.
  permissions           JSONB NOT NULL DEFAULT '{
    "dashboard.view": true,
    "products.view": true,
    "products.create": true,
    "products.edit_request": true,
    "products.delete_request": true,
    "categories.view": true,
    "categories.create": true,
    "categories.edit_request": true,
    "categories.delete_request": true,
    "inventory.view": true,
    "inventory.adjust": true
  }'::jsonb,

  -- Set after an administrator resets the password; the assistant is forced to
  -- choose a new one before anything else is reachable.
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,

  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,

  created_by            UUID,                      -- admins.id, not FK'd: admins may be pruned
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assistant_admins DROP CONSTRAINT IF EXISTS assistant_admins_role_only;
ALTER TABLE assistant_admins ADD CONSTRAINT assistant_admins_role_only
  CHECK (role = 'assistant_admin');

ALTER TABLE assistant_admins DROP CONSTRAINT IF EXISTS assistant_admins_status_check;
ALTER TABLE assistant_admins ADD CONSTRAINT assistant_admins_status_check
  CHECK (status IN ('pending', 'active', 'suspended'));

-- One address, one account, across every account table. Checked in code too
-- (createAssistantHandler), but enforced here so a race cannot slip past.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_admins_email_unique
  ON assistant_admins (lower(email));

ALTER TABLE assistant_admins ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Email verification / password-set tokens
-- ------------------------------------------------------------
-- Only the SHA-256 of the token is stored, so a leaked database row cannot be
-- replayed as a verification link.
CREATE TABLE IF NOT EXISTS assistant_admin_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id  UUID NOT NULL REFERENCES assistant_admins(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  purpose       TEXT NOT NULL,                     -- 'email_verification'
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tokens_hash ON assistant_admin_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_assistant_tokens_assistant ON assistant_admin_tokens(assistant_id, purpose);
ALTER TABLE assistant_admin_tokens ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Login one-time codes (second factor, same shape as admin_otps)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_admin_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id  UUID NOT NULL REFERENCES assistant_admins(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  otp           TEXT NOT NULL,                     -- SHA-256 of the 6 digits
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN NOT NULL DEFAULT FALSE,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_otps_email_created
  ON assistant_admin_otps(email, created_at DESC);
ALTER TABLE assistant_admin_otps ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Sessions - for BOTH account kinds
-- ------------------------------------------------------------
-- Until now the panel had no server-side session at all: every /api/admin route
-- trusted whoever called it. An assistant with a narrower set of rights is only
-- meaningful if the server can tell who is calling, so sessions are introduced
-- here and used to authorise each request.
--
-- actor_type distinguishes 'admin' (admins.id) from 'assistant' (assistant_admins.id).
-- Only the token hash is stored; the token itself exists solely in the browser.
CREATE TABLE IF NOT EXISTS panel_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type     TEXT NOT NULL,
  actor_id       UUID NOT NULL,
  actor_email    TEXT NOT NULL,
  token_hash     TEXT NOT NULL UNIQUE,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT
);

ALTER TABLE panel_sessions DROP CONSTRAINT IF EXISTS panel_sessions_actor_type_check;
ALTER TABLE panel_sessions ADD CONSTRAINT panel_sessions_actor_type_check
  CHECK (actor_type IN ('admin', 'assistant'));

CREATE INDEX IF NOT EXISTS idx_panel_sessions_token ON panel_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_panel_sessions_actor ON panel_sessions(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_panel_sessions_expires ON panel_sessions(expires_at);
ALTER TABLE panel_sessions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. Change requests - the approval queue
-- ------------------------------------------------------------
-- An assistant's edit or delete lands here instead of on the row itself. The
-- payload is what they want applied; before_snapshot is what the row looked
-- like when they asked, so an administrator approving it days later can see
-- exactly what is being changed and from what.
CREATE TABLE IF NOT EXISTS assistant_admin_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id      UUID NOT NULL REFERENCES assistant_admins(id) ON DELETE CASCADE,
  assistant_email   TEXT NOT NULL,

  action            TEXT NOT NULL,                 -- 'update' | 'delete'
  resource          TEXT NOT NULL,                 -- 'product' | 'category'
  resource_id       TEXT NOT NULL,
  resource_label    TEXT,                          -- human name, for the queue

  payload           JSONB,                         -- proposed values (update only)
  before_snapshot   JSONB,
  note              TEXT,                          -- assistant's reason

  status            TEXT NOT NULL DEFAULT 'pending',
  review_note       TEXT,
  reviewed_by       UUID,
  reviewed_by_email TEXT,
  reviewed_at       TIMESTAMPTZ,
  apply_error       TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assistant_admin_requests DROP CONSTRAINT IF EXISTS assistant_requests_action_check;
ALTER TABLE assistant_admin_requests ADD CONSTRAINT assistant_requests_action_check
  CHECK (action IN ('update', 'delete'));

ALTER TABLE assistant_admin_requests DROP CONSTRAINT IF EXISTS assistant_requests_resource_check;
ALTER TABLE assistant_admin_requests ADD CONSTRAINT assistant_requests_resource_check
  CHECK (resource IN ('product', 'category'));

ALTER TABLE assistant_admin_requests DROP CONSTRAINT IF EXISTS assistant_requests_status_check;
ALTER TABLE assistant_admin_requests ADD CONSTRAINT assistant_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_assistant_requests_status
  ON assistant_admin_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_requests_assistant
  ON assistant_admin_requests(assistant_id, created_at DESC);
ALTER TABLE assistant_admin_requests ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 6. Activity log
-- ------------------------------------------------------------
-- Everything an assistant does, plus every refusal, plus screen-capture
-- attempts reported by their browser. This is what "the main admin can see all
-- the things of that assistant" reads from.
CREATE TABLE IF NOT EXISTS assistant_admin_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id  UUID REFERENCES assistant_admins(id) ON DELETE CASCADE,
  actor_email   TEXT,
  action        TEXT NOT NULL,
  resource      TEXT,
  resource_id   TEXT,
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  detail        JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_assistant
  ON assistant_admin_audit(assistant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_audit_created
  ON assistant_admin_audit(created_at DESC);
ALTER TABLE assistant_admin_audit ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. Housekeeping
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_panel_artifacts()
RETURNS void AS $$
BEGIN
  DELETE FROM panel_sessions         WHERE expires_at < now() - INTERVAL '7 days';
  DELETE FROM assistant_admin_otps   WHERE expires_at < now() - INTERVAL '1 day';
  DELETE FROM assistant_admin_tokens WHERE expires_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

SELECT purge_expired_panel_artifacts();

COMMIT;

-- ------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------
-- SELECT email, status, email_verified, permissions FROM assistant_admins ORDER BY created_at;
-- SELECT status, count(*) FROM assistant_admin_requests GROUP BY status;
-- SELECT actor_type, count(*) FROM panel_sessions WHERE revoked_at IS NULL AND expires_at > now() GROUP BY actor_type;
--
-- No email may exist in more than one account table. Expect zero rows:
-- SELECT lower(email) FROM admins
-- UNION ALL SELECT lower(email) FROM cashiers
-- UNION ALL SELECT lower(email) FROM assistant_admins
-- GROUP BY 1 HAVING count(*) > 1;
