-- Run this SQL in Supabase SQL Editor
-- Go to: https://supabase.com/dashboard/project/jzdsgqdwpmfrrspxpehi/sql/new

-- Create email verification OTPs table
CREATE TABLE IF NOT EXISTS public.email_verification_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    user_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email ON public.email_verification_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_otp ON public.email_verification_otps(otp);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_expires_at ON public.email_verification_otps(expires_at);

-- Enable RLS
ALTER TABLE public.email_verification_otps ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage OTPs
DROP POLICY IF EXISTS "Service role can manage email verification OTPs" ON public.email_verification_otps;
CREATE POLICY "Service role can manage email verification OTPs"
ON public.email_verification_otps
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Clean up expired OTPs (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_email_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM public.email_verification_otps
    WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
