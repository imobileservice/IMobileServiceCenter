-- Create hero_slides table for managing hero slider content
CREATE TABLE IF NOT EXISTS hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  image TEXT NOT NULL,
  image2 TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE hero_slides ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active slides
CREATE POLICY "Anyone can read active hero slides" ON hero_slides
  FOR SELECT USING (is_active = true);

-- Policy: Admins can manage all slides
CREATE POLICY "Admins can manage hero slides" ON hero_slides
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND email = 'imobile.admin@gmail.com'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND email = 'imobile.admin@gmail.com'));

-- Add index for ordering
CREATE INDEX IF NOT EXISTS idx_hero_slides_order ON hero_slides(display_order, is_active);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_hero_slides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hero_slides_updated_at
  BEFORE UPDATE ON hero_slides
  FOR EACH ROW
  EXECUTE FUNCTION update_hero_slides_updated_at();

-- Add featured flag to products table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
    ALTER TABLE products ADD COLUMN is_featured BOOLEAN DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);
  END IF;
END
$$;

