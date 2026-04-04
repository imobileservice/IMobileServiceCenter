-- ============================================================
-- ADD CASHIER ROLE SUPPORT to admins table
-- ============================================================

-- Add role column to admins, default to 'admin'
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';

-- Add name column to admins (used for POS display)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS name TEXT;

-- For existing admins, set role to 'admin'
UPDATE admins SET role = 'admin' WHERE role IS NULL;

-- Optionally, set a default name if it is null based on email
UPDATE admins SET name = split_part(email, '@', 1) WHERE name IS NULL;
