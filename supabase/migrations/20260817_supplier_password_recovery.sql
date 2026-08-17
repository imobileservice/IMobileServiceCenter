-- Shop portal password recovery.
--
-- The login itself does not change: inv_suppliers.portal_password stays a
-- one-way scrypt hash and is still the only thing /api/supplier/login checks.
-- A scrypt hash cannot be decrypted, which is the point of it - so a password
-- set before this migration can never be read back, only replaced.
--
-- What this adds is a second, reversible copy of the password, encrypted with
-- AES-256-GCM under CREDENTIAL_SECRET (an environment variable, never stored
-- here), so the office can read a shop's password back to them instead of
-- resetting it every time one is mislaid.
--
-- The column is useless on its own: without the key it is opaque, and it is
-- never sent to the browser except through the reveal endpoint, which makes the
-- administrator type their own password again first.
--
-- If CREDENTIAL_SECRET is not set the app carries on exactly as before - the
-- column simply stays empty.

BEGIN;

ALTER TABLE inv_suppliers ADD COLUMN IF NOT EXISTS portal_password_enc TEXT;

COMMENT ON COLUMN inv_suppliers.portal_password_enc IS
  'AES-256-GCM copy of the portal password, for reading back to the shop. Never used to authenticate - portal_password (scrypt) is. Encrypted under CREDENTIAL_SECRET.';

COMMIT;

-- Rotating CREDENTIAL_SECRET makes every stored copy unreadable (the login
-- hashes are untouched, so nobody is locked out). To start again:
--
--   UPDATE inv_suppliers SET portal_password_enc = NULL;
--
-- and set fresh passwords for the shops that need to be told theirs.
