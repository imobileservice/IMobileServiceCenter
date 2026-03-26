-- Create admin_otps table
CREATE TABLE IF NOT EXISTS admin_otps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on otps
ALTER TABLE admin_otps ENABLE ROW LEVEL SECURITY;

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- Store plain text or hashed. User requested visual access.
  whatsapp TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on admins
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Insert default admin if not exists
INSERT INTO admins (email, password, whatsapp)
VALUES ('imobile.admin@gmail.com', '123456', '+1234567890')
ON CONFLICT (email) DO NOTHING;

-- Cleanup: Remove columns from profiles if they were added by mistake
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'password'
  ) THEN
    ALTER TABLE profiles DROP COLUMN password;
  END IF;
END $$;
