-- ============================================================
-- ADMIN LOGIN OTP (two-step verification)
--
-- The admin_otps table already exists (20260205_create_admin_otps.sql).
-- This migration makes it safe for repeated login attempts:
--   * attempts counter so a code can be locked after 5 wrong tries
--   * indexes for the email lookup done on every verify
--   * a helper to purge expired codes
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Number of wrong codes entered against this OTP row.
ALTER TABLE admin_otps ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_admin_otps_email ON admin_otps(email);
CREATE INDEX IF NOT EXISTS idx_admin_otps_expires_at ON admin_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_otps_email_created ON admin_otps(email, created_at DESC);

ALTER TABLE admin_otps ENABLE ROW LEVEL SECURITY;

-- The backend talks to this table with the service_role key only; no
-- anon/authenticated policy is defined on purpose, so codes are never
-- readable from the browser.

-- Housekeeping: drop codes that expired more than a day ago.
CREATE OR REPLACE FUNCTION purge_expired_admin_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM admin_otps WHERE expires_at < now() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

SELECT purge_expired_admin_otps();
