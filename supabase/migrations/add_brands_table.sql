-- Brands table
--
-- The admin panel used to offer a literal "Other" brand option, which is how 68
-- products ended up saved as brand = 'Other' with the real manufacturer buried
-- in the model text ("Other MOTO G30 Display"). "Other" is gone from the UI:
-- admins now add a real brand through the "Add New Brand" dialog, and the brand
-- is stored here so it is available on every device from then on.
--
-- `models` caches the model list discovered for the brand (either from the AI
-- lookup or typed by the admin), so the Model dropdown is populated the next
-- time the brand is picked.

CREATE TABLE IF NOT EXISTS brands (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  models JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Case-insensitive uniqueness so "wiko" cannot be added alongside "Wiko"
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name_lower ON brands (LOWER(name));

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Everyone can read brands (the storefront filter sidebar uses them)
DROP POLICY IF EXISTS "Brands are viewable by everyone" ON brands;
CREATE POLICY "Brands are viewable by everyone" ON brands
  FOR SELECT USING (true);

-- Writes happen through the admin API with the service role key, which bypasses
-- RLS. This policy only covers a signed-in admin hitting the table directly.
DROP POLICY IF EXISTS "Only admins can manage brands" ON brands;
CREATE POLICY "Only admins can manage brands" ON brands
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- Seed the brands already present in the catalogue so the dropdown is never
-- empty even before an admin adds one. ON CONFLICT keeps this re-runnable.
INSERT INTO brands (name, slug) VALUES
  ('Apple', 'apple'),
  ('Asus', 'asus'),
  ('Blackview', 'blackview'),
  ('Coolpad', 'coolpad'),
  ('Doogee', 'doogee'),
  ('Freeyond', 'freeyond'),
  ('Google', 'google'),
  ('Honor', 'honor'),
  ('Hotwav', 'hotwav'),
  ('Huawei', 'huawei'),
  ('Infinix', 'infinix'),
  ('Lebest', 'lebest'),
  ('Meizu', 'meizu'),
  ('Motorola', 'motorola'),
  ('Nokia', 'nokia'),
  ('Nothing', 'nothing'),
  ('OnePlus', 'oneplus'),
  ('Oppo', 'oppo'),
  ('Poco', 'poco'),
  ('Realme', 'realme'),
  ('Redbeat', 'redbeat'),
  ('Redmi', 'redmi'),
  ('Samsung', 'samsung'),
  ('Sony', 'sony'),
  ('TCL', 'tcl'),
  ('Tecno', 'tecno'),
  ('Umidigi', 'umidigi'),
  ('Vivo', 'vivo'),
  ('Wiko', 'wiko'),
  ('Xiaomi', 'xiaomi'),
  ('ZTE', 'zte'),
  ('itel', 'itel')
ON CONFLICT (name) DO NOTHING;
