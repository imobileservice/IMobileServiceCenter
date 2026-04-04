-- Create cashier_otp table (renamed from admin_otp)
CREATE TABLE IF NOT EXISTS public.cashier_otp (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_cashier_otp_email ON cashier_otp(email);
CREATE INDEX IF NOT EXISTS idx_cashier_otp_otp ON cashier_otp(otp);
CREATE INDEX IF NOT EXISTS idx_cashier_otp_expires_at ON cashier_otp(expires_at);

-- RLS
ALTER TABLE cashier_otp ENABLE ROW LEVEL SECURITY;

-- Note: In this project, service-role is used for OTP verification from backend
DROP POLICY IF EXISTS "Service role access" ON cashier_otp;
CREATE POLICY "Service role access" ON cashier_otp
    FOR ALL
    USING (false);
