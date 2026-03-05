-- Categories table for managing product categories and their field configurations
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  field_config JSONB NOT NULL DEFAULT '{"fields": []}'::jsonb,
  -- field_config structure:
  -- {
  --   "fields": [
  --     {
  --       "key": "storage",
  --       "label": "Storage",
  --       "type": "select",
  --       "options": ["64GB", "128GB", "256GB"],
  --       "required": true,
  --       "placeholder": "Select storage"
  --     }
  --   ]
  -- }
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read categories
CREATE POLICY "Categories are viewable by everyone" ON categories
  FOR SELECT USING (true);

-- Policy: Only admins can manage categories
CREATE POLICY "Only admins can manage categories" ON categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- Insert default categories with their field configurations
INSERT INTO categories (name, slug, description, field_config, sort_order) VALUES
(
  'Mobile Phones',
  'mobile-phones',
  'Smartphones and mobile devices',
  '{
    "fields": [
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "ram", "label": "RAM", "type": "select", "options": ["4GB", "6GB", "8GB", "12GB", "16GB", "18GB"], "required": true},
      {"key": "screenSize", "label": "Screen Size", "type": "text", "placeholder": "6.1 inches", "required": true},
      {"key": "battery", "label": "Battery", "type": "text", "placeholder": "4000 mAh", "required": true},
      {"key": "camera", "label": "Camera", "type": "text", "placeholder": "48MP + 12MP", "required": true},
      {"key": "processor", "label": "Processor", "type": "text", "placeholder": "A17 Pro / Snapdragon 8 Gen 3", "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["No Warranty", "6 Months Warranty", "1 Year Warranty", "Company Warranty", "2 Years Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "Titanium Blue, Black, White", "required": false},
      {"key": "os", "label": "Operating System", "type": "select", "options": ["iOS", "Android", "Other"], "required": false}
    ]
  }'::jsonb,
  1
),
(
  'Tablets',
  'tablets',
  'Tablet devices and iPads',
  '{
    "fields": [
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "ram", "label": "RAM", "type": "select", "options": ["4GB", "6GB", "8GB", "12GB", "16GB"], "required": true},
      {"key": "screenSize", "label": "Screen Size", "type": "text", "placeholder": "10.9 inches", "required": true},
      {"key": "battery", "label": "Battery", "type": "text", "placeholder": "8000 mAh", "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["No Warranty", "6 Months Warranty", "1 Year Warranty", "Company Warranty", "2 Years Warranty"], "required": true},
      {"key": "connectivity", "label": "Connectivity", "type": "select", "options": ["Wi-Fi Only", "Wi-Fi + Cellular"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "Space Gray, Silver", "required": false}
    ]
  }'::jsonb,
  2
),
(
  'Smartwatches',
  'smartwatches',
  'Smart watches and wearables',
  '{
    "fields": [
      {"key": "display", "label": "Display", "type": "text", "placeholder": "1.9 inch OLED", "required": true},
      {"key": "battery", "label": "Battery Life", "type": "text", "placeholder": "18 hours", "required": true},
      {"key": "waterResistance", "label": "Water Resistance", "type": "select", "options": ["None", "IPX7", "5 ATM", "10 ATM", "50m"], "required": true},
      {"key": "connectivity", "label": "Connectivity", "type": "select", "options": ["Bluetooth", "Bluetooth + GPS", "Bluetooth + GPS + Cellular"], "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["No Warranty", "6 Months Warranty", "1 Year Warranty", "Company Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "Black, Silver, Gold", "required": false},
      {"key": "bandSize", "label": "Band Size", "type": "text", "placeholder": "Small, Medium, Large", "required": false}
    ]
  }'::jsonb,
  3
),
(
  'Accessories',
  'accessories',
  'Phone and device accessories',
  '{
    "fields": [
      {"key": "type", "label": "Accessory Type", "type": "select", "options": ["Case", "Charger", "Cable", "Headphones", "Screen Protector", "Power Bank", "Other"], "required": true},
      {"key": "compatibility", "label": "Compatibility", "type": "text", "placeholder": "iPhone 15, Samsung S24, Universal", "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["No Warranty", "3 Months Warranty", "6 Months Warranty", "1 Year Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "Black, White, Transparent", "required": false},
      {"key": "material", "label": "Material", "type": "text", "placeholder": "Silicone, Leather, Plastic", "required": false}
    ]
  }'::jsonb,
  4
)
ON CONFLICT (slug) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

