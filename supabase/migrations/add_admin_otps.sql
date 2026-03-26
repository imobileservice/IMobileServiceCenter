-- Create admin_otps table for one-time password authentication
CREATE TABLE IF NOT EXISTS admin_otps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_otps_email ON admin_otps(email);
CREATE INDEX IF NOT EXISTS idx_admin_otps_otp ON admin_otps(otp);
CREATE INDEX IF NOT EXISTS idx_admin_otps_expires_at ON admin_otps(expires_at);

-- Enable RLS
ALTER TABLE admin_otps ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (backend only)
CREATE POLICY "Service role only" ON admin_otps
  FOR ALL
  USING (false);

-- Note: This table is accessed only via backend with service role key
-- Frontend cannot directly access this table

