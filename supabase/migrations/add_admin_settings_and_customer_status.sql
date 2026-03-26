-- Add admin_settings table for storing admin WhatsApp number
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings" ON admin_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND email = 'imobile.admin@gmail.com'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND email = 'imobile.admin@gmail.com'));

-- Public can read settings (for WhatsApp number display, etc.)
CREATE POLICY "Public can view settings" ON admin_settings
  FOR SELECT USING (true);

-- Insert default admin WhatsApp setting
INSERT INTO admin_settings (key, value, description) VALUES
  ('admin_whatsapp', '', 'Admin WhatsApp number for sending order receipts')
ON CONFLICT (key) DO NOTHING;

-- Add checkout_status column to profiles table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'checkout_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN checkout_status TEXT CHECK (checkout_status IN ('success', 'pending', 'cancel')) DEFAULT NULL;
  END IF;
END $$;

-- Add index for checkout_status
CREATE INDEX IF NOT EXISTS idx_profiles_checkout_status ON profiles(checkout_status);

-- Update payment_method constraint in orders to only allow 'cash_on_delivery' and 'visit_shop'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
  CHECK (payment_method IS NULL OR payment_method IN ('cash_on_delivery', 'visit_shop'));

