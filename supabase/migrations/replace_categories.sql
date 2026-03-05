-- Replace all existing categories with new category structure
-- This migration deletes old categories and inserts new ones

-- First, delete all existing categories
DELETE FROM categories;

-- Reset the sequence if needed (PostgreSQL handles UUIDs automatically, but good practice)
-- Note: We're using UUIDs, so no sequence reset needed

-- Insert new categories
-- Categories are: Display, IC, Battery, Charger, Mobile Phones, Housing, Screen Guard, Accessories, Power Bank, Used Items

INSERT INTO categories (name, slug, description, field_config, sort_order, is_active) VALUES

-- 1. Display
(
  'Display',
  'display',
  'Mobile phone displays and screens',
  '{"fields": []}'::jsonb,
  1,
  true
),

-- 2. IC
(
  'IC',
  'ic',
  'Integrated circuits and chips',
  '{"fields": []}'::jsonb,
  2,
  true
),

-- 3. Battery
(
  'Battery',
  'battery',
  'Mobile phone batteries',
  '{"fields": []}'::jsonb,
  3,
  true
),

-- 4. Charger
(
  'Charger',
  'charger',
  'Phone chargers and charging accessories',
  '{"fields": []}'::jsonb,
  4,
  true
),

-- 5. Mobile Phones (parent category - will have subcategories)
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
  5,
  true
),

-- Mobile Phones Subcategories (models)
(
  'iPhone',
  'mobile-phones-iphone',
  'Apple iPhone models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Samsung',
  'mobile-phones-samsung',
  'Samsung Galaxy models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'OnePlus',
  'mobile-phones-oneplus',
  'OnePlus models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Google Pixel',
  'mobile-phones-google-pixel',
  'Google Pixel models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Xiaomi',
  'mobile-phones-xiaomi',
  'Xiaomi models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Oppo',
  'mobile-phones-oppo',
  'Oppo models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Vivo',
  'mobile-phones-vivo',
  'Vivo models',
  '{"fields": []}'::jsonb,
  5,
  true
),
(
  'Tablets',
  'mobile-phones-tablets',
  'Tablet devices',
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
  5,
  true
),

-- 6. Housing
(
  'Housing',
  'housing',
  'Phone housing and frames',
  '{"fields": []}'::jsonb,
  6,
  true
),

-- 7. Screen Guard
(
  'Screen Guard',
  'screen-guard',
  'Screen protectors and guards',
  '{"fields": []}'::jsonb,
  7,
  true
),

-- 8. Accessories (parent category - will have subcategories)
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
  8,
  true
),

-- Accessories Subcategories
(
  'Handsfree',
  'accessories-handsfree',
  'Handsfree and earphones',
  '{"fields": []}'::jsonb,
  8,
  true
),
(
  'Cables',
  'accessories-cables',
  'USB cables and charging cables',
  '{"fields": []}'::jsonb,
  8,
  true
),
(
  'Cases',
  'accessories-cases',
  'Phone cases and covers',
  '{"fields": []}'::jsonb,
  8,
  true
),
(
  'Screen Protectors',
  'accessories-screen-protectors',
  'Screen protectors and films',
  '{"fields": []}'::jsonb,
  8,
  true
),
(
  'Other Accessories',
  'accessories-other',
  'Other phone accessories',
  '{"fields": []}'::jsonb,
  8,
  true
),

-- 9. Power Bank
(
  'Power Bank',
  'power-bank',
  'Portable power banks and battery packs',
  '{"fields": []}'::jsonb,
  9,
  true
),

-- 10. Used Items (parent category - will have subcategories)
(
  'Used Items',
  'used-items',
  'Pre-owned mobile phones and devices',
  '{
    "fields": [
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "ram", "label": "RAM", "type": "select", "options": ["4GB", "6GB", "8GB", "12GB", "16GB"], "required": true},
      {"key": "condition", "label": "Condition", "type": "select", "options": ["Excellent", "Good", "Fair", "Poor"], "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["No Warranty", "3 Months Warranty", "6 Months Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "Black, White, Blue", "required": false}
    ]
  }'::jsonb,
  10,
  true
),

-- Used Items Subcategories (mobile phone models)
(
  'Used iPhone',
  'used-items-iphone',
  'Pre-owned Apple iPhones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Samsung',
  'used-items-samsung',
  'Pre-owned Samsung phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used OnePlus',
  'used-items-oneplus',
  'Pre-owned OnePlus phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Google Pixel',
  'used-items-google-pixel',
  'Pre-owned Google Pixel phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Xiaomi',
  'used-items-xiaomi',
  'Pre-owned Xiaomi phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Oppo',
  'used-items-oppo',
  'Pre-owned Oppo phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Vivo',
  'used-items-vivo',
  'Pre-owned Vivo phones',
  '{"fields": []}'::jsonb,
  10,
  true
),
(
  'Used Other',
  'used-items-other',
  'Other pre-owned phones',
  '{"fields": []}'::jsonb,
  10,
  true
);

-- Update the updated_at timestamp
UPDATE categories SET updated_at = TIMEZONE('utc', NOW()) WHERE updated_at IS NULL;

