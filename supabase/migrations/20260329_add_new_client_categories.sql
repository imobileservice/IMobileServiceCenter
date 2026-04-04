-- 1. Remove old test categories to ensure a clean slate
TRUNCATE TABLE categories CASCADE;

-- 2. Insert exactly the requested categories with full brand drop-downs
INSERT INTO categories (name, slug, description, field_config, sort_order) VALUES
(
  'Display (main)',
  'display-main',
  'Mobile phone displays and screens',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., Samsung Galaxy S23", "required": true},
      {"key": "quality", "label": "Quality", "type": "select", "options": ["Original", "Compatible", "OLED", "Incell"], "required": true}
    ]
  }'::jsonb,
  1
),
(
  'On Off Ribbon (main)',
  'on-off-ribbon-main',
  'Power and volume ribbons',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., iPhone 13 Pro", "required": true}
    ]
  }'::jsonb,
  2
),
(
  'Charging PCB',
  'charging-pcb',
  'Charging port boards',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., Redmi Note 10", "required": true},
      {"key": "original", "label": "Is Original?", "type": "select", "options": ["Original", "High Copy"], "required": true}
    ]
  }'::jsonb,
  3
),
(
  'Charging Pin',
  'charging-pin',
  'Individual charging ports/jacks',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., Type-C Universal", "required": true},
      {"key": "type", "label": "Pin Type", "type": "select", "options": ["Type-C", "Micro USB", "Lightning"], "required": true}
    ]
  }'::jsonb,
  4
),
(
  'Out Key',
  'out-key',
  'Outer hardware buttons',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., iPhone X Power Button", "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "e.g., Silver, Black", "required": false}
    ]
  }'::jsonb,
  5
),
(
  'Brand new Phone',
  'brand-new-phone',
  'Sealed, brand new mobile phones',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., Samsung Galaxy S24 Ultra", "required": true},
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "ram", "label": "RAM", "type": "select", "options": ["4GB", "6GB", "8GB", "12GB", "16GB"], "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["1 Year Company Warranty", "1 Year Shop Warranty", "No Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "e.g., Titanium Black", "required": true}
    ]
  }'::jsonb,
  6
),
(
  'Used Mobile phone',
  'used-mobile-phone',
  'Pre-owned and second-hand phones',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., iPhone 12 Pro", "required": true},
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "battery", "label": "Battery Health (%)", "type": "text", "placeholder": "e.g., 85%", "required": false},
      {"key": "condition", "label": "Physical Condition", "type": "select", "options": ["Like New (Mint)", "Excellent", "Good", "Fair"], "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["Testing Warranty", "1 Month Warranty", "3 Months Warranty", "No Warranty"], "required": true},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "e.g., Pacific Blue", "required": true}
    ]
  }'::jsonb,
  7
),
(
  'Accessories',
  'accessories',
  'Cases, chargers, and general parts',
  '{
    "fields": [
      {"key": "type", "label": "Accessory Type", "type": "select", "options": ["Case/Cover", "Charger/Adapter", "Charging Cable", "Earphones/Pods", "Power Bank", "Other"], "required": true},
      {"key": "brand", "label": "Compatible Brand", "type": "select", "options": ["Universal", "Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Compatible Models", "type": "text", "placeholder": "e.g., iPhone 13/14 Series", "required": false},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "e.g., White", "required": false}
    ]
  }'::jsonb,
  8
),
(
  'Tempered Glass',
  'tempered-glass',
  'Screen protectors',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo", "Realme", "OnePlus", "Huawei", "Honor", "Sony", "Asus", "Motorola", "Google", "Nokia", "Nothing", "Infinix", "Tecno", "Itel", "ZTE", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., iPhone 15 Pro", "required": true},
      {"key": "type", "label": "Type", "type": "select", "options": ["Clear / Standard", "Matte / Gaming", "Privacy", "UV Glass", "Ceramic"], "required": true}
    ]
  }'::jsonb,
  9
),
(
  'Smart Watch',
  'smart-watch',
  'Smartwatches and fitness bands',
  '{
    "fields": [
      {"key": "brand", "label": "Brand", "type": "select", "options": ["Apple", "Samsung", "Xiaomi", "Amazfit", "Huawei", "Garmin", "Fitbit", "Realme", "Oppo", "Noise", "Boat", "Fire-Boltt", "Other"], "required": true},
      {"key": "model", "label": "Model", "type": "text", "placeholder": "e.g., Apple Watch Series 9", "required": true},
      {"key": "size", "label": "Dial Size", "type": "text", "placeholder": "e.g., 41mm, 45mm", "required": false},
      {"key": "color", "label": "Color", "type": "text", "placeholder": "e.g., Midnight", "required": false},
      {"key": "condition", "label": "Condition", "type": "select", "options": ["Brand New", "Used"], "required": true},
      {"key": "warranty", "label": "Warranty", "type": "select", "options": ["1 Year Company", "Store Warranty", "No Warranty"], "required": true}
    ]
  }'::jsonb,
  10
);
