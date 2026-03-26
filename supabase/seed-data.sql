-- Seed Categories and Products
-- This script adds all categories with at least one example product each

-- Insert products for each category
-- Mobile Phones and subcategories
INSERT INTO products (name, description, price, stock, image, images, category, brand, condition, specs) VALUES
-- Mobile Phones - Apple
('iPhone 15 Pro Max', 'Latest iPhone with A17 Pro chip, 256GB storage, Titanium design', 119900, 10, '/iphone-15-pro-max.png', ARRAY['/iphone-15-pro-max.png', '/iphone-15-pro-max-2.jpg'], 'mobile-phones', 'Apple', 'new', '{"storage": "256GB", "ram": "8GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Samsung
('Samsung Galaxy S24 Ultra', 'Premium Android phone with S Pen, 512GB storage', 129900, 8, '/samsung-galaxy-s24-ultra.png', ARRAY['/samsung-galaxy-s24-ultra.png', '/samsung-galaxy-s24-ultra-2.jpg'], 'mobile-phones', 'Samsung', 'new', '{"storage": "512GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - OnePlus
('OnePlus 12', 'Flagship phone with Snapdragon 8 Gen 3, 256GB storage', 79900, 15, '/oneplus-12-smartphone.jpg', ARRAY['/oneplus-12-smartphone.jpg', '/oneplus-12-2.jpg'], 'mobile-phones', 'OnePlus', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Google
('Google Pixel 8 Pro', 'AI-powered smartphone with advanced camera, 256GB', 99900, 12, '/google-pixel-8-pro.png', ARRAY['/google-pixel-8-pro.png'], 'mobile-phones', 'Google', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Oppo
('Oppo Find X7', 'Premium smartphone with advanced camera system, 512GB', 89900, 6, '/oppo-find-x7-smartphone.jpg', ARRAY['/oppo-find-x7-smartphone.jpg'], 'mobile-phones', 'Oppo', 'new', '{"storage": "512GB", "ram": "16GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Vivo
('Vivo X100', 'Flagship phone with MediaTek Dimensity 9300, 256GB', 74900, 8, '/vivo-x100-smartphone.jpg', ARRAY['/vivo-x100-smartphone.jpg'], 'mobile-phones', 'Vivo', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Xiaomi
('Xiaomi 14 Ultra', 'Premium camera phone with Leica lenses, 512GB', 69900, 10, '/xiaomi-14-ultra-smartphone.jpg', ARRAY['/xiaomi-14-ultra-smartphone.jpg'], 'mobile-phones', 'Xiaomi', 'new', '{"storage": "512GB", "ram": "16GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Realme
('Realme 12 Pro', 'Mid-range phone with great camera, 256GB', 54900, 20, '/realme-12-pro-smartphone.jpg', ARRAY['/realme-12-pro-smartphone.jpg'], 'mobile-phones', 'Realme', 'new', '{"storage": "256GB", "ram": "8GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Nokia
('Nokia G60', 'Durable smartphone with clean Android, 128GB', 29900, 15, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Nokia', 'new', '{"storage": "128GB", "ram": "6GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Huawei
('Huawei P60 Pro', 'Premium phone with advanced camera, 256GB', 89900, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Huawei', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Honor
('Honor Magic 6 Pro', 'Flagship phone with advanced AI, 512GB', 79900, 7, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'HONOR', 'new', '{"storage": "512GB", "ram": "16GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - ASUS
('ASUS ROG Phone 7', 'Gaming smartphone with Snapdragon 8 Gen 2, 256GB', 89900, 4, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'ASUS', 'new', '{"storage": "256GB", "ram": "16GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - TCL
('TCL 30 Pro 5G', 'Affordable 5G smartphone, 128GB', 24900, 12, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'TCL', 'new', '{"storage": "128GB", "ram": "6GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Tecno
('Tecno Phantom X2', 'Premium phone with MediaTek chip, 256GB', 39900, 9, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Tecno', 'new', '{"storage": "256GB", "ram": "8GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Wiko
('Wiko 5G', 'Budget 5G smartphone, 128GB', 19900, 18, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Wiko', 'new', '{"storage": "128GB", "ram": "6GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - ZTE
('ZTE Axon 40 Ultra', 'Flagship phone with under-display camera, 256GB', 69900, 6, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'ZTE', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - CAT
('CAT S75', 'Rugged smartphone for tough conditions, 128GB', 49900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'CAT', 'new', '{"storage": "128GB", "ram": "6GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Caterpillar
('Caterpillar S61', 'Rugged smartphone with thermal camera, 64GB', 59900, 2, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Caterpillar', 'new', '{"storage": "64GB", "ram": "4GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - HMD
('HMD Global Nokia X30', '5G smartphone with PureDisplay, 256GB', 34900, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'HMD', 'new', '{"storage": "256GB", "ram": "8GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Nothing
('Nothing Phone 2', 'Unique transparent design with Glyph interface, 256GB', 49900, 10, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Nothing', 'new', '{"storage": "256GB", "ram": "12GB", "warranty": "Company Warranty"}'::jsonb),
-- Mobile Phones - Infinix
('Infinix Zero 30', 'Premium phone with 108MP camera, 256GB', 29900, 14, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-phones', 'Infinix', 'new', '{"storage": "256GB", "ram": "8GB", "warranty": "Company Warranty"}'::jsonb),

-- iPads & Tablets
('iPad Pro 12.9" M2', 'Large tablet with M2 chip, 256GB storage', 89900, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'ipads-tablets', 'Apple', 'new', '{"storage": "256GB", "screen": "12.9 inch", "warranty": "Company Warranty"}'::jsonb),
('Samsung Galaxy Tab S9', 'Premium Android tablet with S Pen, 256GB', 69900, 10, '/placeholder.svg', ARRAY['/placeholder.svg'], 'ipads-tablets', 'Samsung', 'new', '{"storage": "256GB", "screen": "11 inch", "warranty": "Company Warranty"}'::jsonb),

-- Mobile Accessories
('Wireless Charging Pad', 'Fast wireless charger compatible with all phones', 2990, 50, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-accessories', 'Baseus', 'new', '{"power": "15W", "compatibility": "Universal"}'::jsonb),
('Phone Case - Clear', 'Transparent protective case for smartphones', 990, 100, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mobile-accessories', 'Baseus', 'new', '{"material": "TPU", "protection": "Drop Protection"}'::jsonb),

-- Chargers
('USB-C Fast Charger', '65W fast charging adapter with USB-C cable', 1990, 80, '/placeholder.svg', ARRAY['/placeholder.svg'], 'charger', 'Baseus', 'new', '{"power": "65W", "ports": "1"}'::jsonb),
('Wireless Charging Stand', 'Standing wireless charger with cooling fan', 3990, 40, '/placeholder.svg', ARRAY['/placeholder.svg'], 'charger', 'Baseus', 'new', '{"power": "15W", "type": "Stand"}'::jsonb),

-- Earbuds
('True Wireless Earbuds Pro', 'Active noise cancellation, 30hr battery', 4990, 60, '/placeholder.svg', ARRAY['/placeholder.svg'], 'earbuds', 'Baseus', 'new', '{"anc": "Yes", "battery": "30 hours"}'::jsonb),
('Sports Earbuds', 'Sweat-proof wireless earbuds for workouts', 2990, 75, '/placeholder.svg', ARRAY['/placeholder.svg'], 'earbuds', 'Baseus', 'new', '{"waterproof": "IPX7", "battery": "24 hours"}'::jsonb),

-- Headphones
('Over-Ear Headphones', 'Comfortable over-ear headphones with ANC', 8990, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'headphones', 'Baseus', 'new', '{"anc": "Yes", "battery": "40 hours"}'::jsonb),
('Gaming Headset', 'RGB gaming headset with 7.1 surround sound', 6990, 25, '/placeholder.svg', ARRAY['/placeholder.svg'], 'headphones', 'Baseus', 'new', '{"surround": "7.1", "microphone": "Yes"}'::jsonb),

-- Power Banks
('20000mAh Power Bank', 'High capacity power bank with fast charging', 3990, 45, '/placeholder.svg', ARRAY['/placeholder.svg'], 'power-banks', 'Baseus', 'new', '{"capacity": "20000mAh", "ports": "3"}'::jsonb),
('10000mAh Slim Power Bank', 'Compact power bank for daily use', 2490, 60, '/placeholder.svg', ARRAY['/placeholder.svg'], 'power-banks', 'Baseus', 'new', '{"capacity": "10000mAh", "ports": "2"}'::jsonb),

-- Security & Protection
('Tempered Glass Screen Protector', '9H hardness screen protector, 2-pack', 990, 150, '/placeholder.svg', ARRAY['/placeholder.svg'], 'security-protection', 'Baseus', 'new', '{"hardness": "9H", "quantity": "2"}'::jsonb),
('Phone Insurance Case', 'Heavy-duty protective case with stand', 1990, 80, '/placeholder.svg', ARRAY['/placeholder.svg'], 'security-protection', 'Baseus', 'new', '{"protection": "Military Grade", "stand": "Yes"}'::jsonb),

-- Smart Watches & Fitness Bands
('Smart Watch Pro', 'Fitness tracking smartwatch with AMOLED display', 8990, 35, '/placeholder.svg', ARRAY['/placeholder.svg'], 'smart-watches', 'Baseus', 'new', '{"display": "AMOLED", "battery": "7 days"}'::jsonb),
('Fitness Band', 'Activity tracker with heart rate monitor', 2990, 50, '/placeholder.svg', ARRAY['/placeholder.svg'], 'smart-watches', 'Baseus', 'new', '{"features": "Heart Rate, Sleep Tracking", "battery": "14 days"}'::jsonb),

-- Speakers
('Bluetooth Speaker', 'Portable speaker with 360° sound, 20W', 4990, 40, '/placeholder.svg', ARRAY['/placeholder.svg'], 'speakers', 'Baseus', 'new', '{"power": "20W", "battery": "12 hours"}'::jsonb),
('Waterproof Speaker', 'IPX7 waterproof speaker for outdoor use', 3990, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'speakers', 'Baseus', 'new', '{"waterproof": "IPX7", "power": "15W"}'::jsonb),

-- Apple Mac
('MacBook Pro 14" M3', 'Professional laptop with M3 chip, 16GB RAM, 512GB', 189900, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'apple-mac', 'Apple', 'new', '{"chip": "M3", "ram": "16GB", "storage": "512GB"}'::jsonb),
('MacBook Air 13" M2', 'Lightweight laptop with M2 chip, 8GB RAM, 256GB', 119900, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'apple-mac', 'Apple', 'new', '{"chip": "M2", "ram": "8GB", "storage": "256GB"}'::jsonb),

-- MacBook
('MacBook Pro 16" M3 Max', 'Top-tier laptop with M3 Max, 32GB RAM, 1TB', 299900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'macbook', 'Apple', 'new', '{"chip": "M3 Max", "ram": "32GB", "storage": "1TB"}'::jsonb),

-- Mac Mini
('Mac Mini M2', 'Compact desktop computer with M2 chip, 16GB RAM, 512GB', 89900, 6, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mac-mini', 'Apple', 'new', '{"chip": "M2", "ram": "16GB", "storage": "512GB"}'::jsonb),

-- Apple Vision Pro
('Apple Vision Pro', 'Spatial computing headset with advanced displays', 349900, 2, '/placeholder.svg', ARRAY['/placeholder.svg'], 'apple-vision-pro', 'Apple', 'new', '{"storage": "256GB", "displays": "Dual Micro-OLED"}'::jsonb),

-- Baseus Products
('Baseus Car Mount', 'Magnetic car mount for smartphones', 1990, 60, '/placeholder.svg', ARRAY['/placeholder.svg'], 'baseus', 'Baseus', 'new', '{"type": "Magnetic", "compatibility": "Universal"}'::jsonb),
('Baseus Cable Organizer', 'Cable management organizer box', 990, 100, '/placeholder.svg', ARRAY['/placeholder.svg'], 'baseus', 'Baseus', 'new', '{"material": "ABS", "slots": "6"}'::jsonb),

-- Other Categories (at least one example each)
('Action Camera 4K', 'Waterproof 4K action camera for sports', 19900, 4, '/placeholder.svg', ARRAY['/placeholder.svg'], 'action-cameras', 'GoPro', 'new', '{"resolution": "4K", "waterproof": "Yes"}'::jsonb),
('Air Purifier HEPA', 'HEPA air purifier for home, 500 sq ft coverage', 12900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'air-purifier', 'Xiaomi', 'new', '{"coverage": "500 sq ft", "filter": "HEPA"}'::jsonb),
('Apple Lightning Cable', 'Official Apple Lightning to USB-C cable, 1m', 1990, 50, '/placeholder.svg', ARRAY['/placeholder.svg'], 'apple-accessories', 'Apple', 'new', '{"length": "1m", "type": "Lightning"}'::jsonb),
('Audio Speaker System', '2.1 channel speaker system with subwoofer', 8990, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'audio-speakers', 'Logitech', 'new', '{"channels": "2.1", "power": "40W"}'::jsonb),
('Phone Battery Replacement', 'Original battery replacement for smartphones', 2990, 20, '/placeholder.svg', ARRAY['/placeholder.svg'], 'battery', 'Generic', 'new', '{"capacity": "4000mAh", "type": "Li-ion"}'::jsonb),
('Bluetooth Earbuds Basic', 'Simple wireless earbuds with good sound', 1990, 40, '/placeholder.svg', ARRAY['/placeholder.svg'], 'bluetooth-earbuds', 'Baseus', 'new', '{"battery": "20 hours", "type": "TWS"}'::jsonb),
('Bluetooth Headphones', 'Over-ear Bluetooth headphones with long battery', 4990, 25, '/placeholder.svg', ARRAY['/placeholder.svg'], 'bluetooth-headphones', 'Baseus', 'new', '{"battery": "30 hours", "anc": "No"}'::jsonb),
('Bluetooth Headset', 'Wireless headset with microphone for calls', 2990, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'bluetooth-headsets', 'Baseus', 'new', '{"battery": "8 hours", "microphone": "Yes"}'::jsonb),
('USB-C Cable', 'Fast charging USB-C cable, 2m length', 990, 80, '/placeholder.svg', ARRAY['/placeholder.svg'], 'cable', 'Baseus', 'new', '{"length": "2m", "type": "USB-C"}'::jsonb),
('Car Phone Holder', 'Adjustable car phone mount with suction cup', 1490, 45, '/placeholder.svg', ARRAY['/placeholder.svg'], 'car-accessories', 'Baseus', 'new', '{"type": "Suction Cup", "adjustable": "Yes"}'::jsonb),
('Company Phone Bundle', 'Business phone package with warranty', 49900, 2, '/placeholder.svg', ARRAY['/placeholder.svg'], 'company-mobile-phones', 'Samsung', 'new', '{"warranty": "Extended", "support": "Business"}'::jsonb),
('USB Hub 7-Port', '7-port USB hub with power adapter', 3990, 15, '/placeholder.svg', ARRAY['/placeholder.svg'], 'computer-peripherals', 'Baseus', 'new', '{"ports": "7", "power": "65W"}'::jsonb),
('Dash Cam 4K', '4K dashboard camera with night vision', 8990, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'dashboard-cameras', 'Baseus', 'new', '{"resolution": "4K", "night_vision": "Yes"}'::jsonb),
('External SSD 1TB', 'Fast external SSD drive, USB-C, 1TB', 8990, 12, '/placeholder.svg', ARRAY['/placeholder.svg'], 'data-transfer', 'Samsung', 'new', '{"capacity": "1TB", "speed": "1050MB/s"}'::jsonb),
('Digital Camera', '24MP digital camera with 4K video', 29900, 4, '/placeholder.svg', ARRAY['/placeholder.svg'], 'digital-cameras', 'Canon', 'new', '{"resolution": "24MP", "video": "4K"}'::jsonb),
('Drone with Camera', '4K camera drone with GPS and auto-return', 49900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'drones', 'DJI', 'new', '{"camera": "4K", "flight_time": "30 min"}'::jsonb),
('Wired Earphones', 'High-quality wired earphones with mic', 990, 50, '/placeholder.svg', ARRAY['/placeholder.svg'], 'earphones', 'Baseus', 'new', '{"type": "Wired", "microphone": "Yes"}'::jsonb),
('Electric Bike', 'E-bike with 250W motor, 25km range', 89900, 2, '/placeholder.svg', ARRAY['/placeholder.svg'], 'electric-bike', 'Xiaomi', 'new', '{"motor": "250W", "range": "25km"}'::jsonb),
('Gaming Console', 'Latest gaming console with controller', 49900, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'gaming-console', 'Sony', 'new', '{"storage": "1TB", "controller": "Included"}'::jsonb),
('Gift Voucher Rs. 5000', 'Redeemable gift voucher worth Rs. 5000', 5000, 100, '/placeholder.svg', ARRAY['/placeholder.svg'], 'gift-vouchers', 'IMobile', 'new', '{"value": "5000", "validity": "1 year"}'::jsonb),
('Phone Gimbal', '3-axis smartphone gimbal for smooth video', 8990, 6, '/placeholder.svg', ARRAY['/placeholder.svg'], 'gimbal', 'DJI', 'new', '{"axes": "3", "weight": "300g"}'::jsonb),
('External HDD 2TB', 'Portable external hard drive, 2TB', 5990, 10, '/placeholder.svg', ARRAY['/placeholder.svg'], 'hd-drive', 'Seagate', 'new', '{"capacity": "2TB", "type": "HDD"}'::jsonb),
('HD Webcam 1080p', 'Full HD webcam for video calls', 4990, 12, '/placeholder.svg', ARRAY['/placeholder.svg'], 'hd-webcam', 'Logitech', 'new', '{"resolution": "1080p", "microphone": "Yes"}'::jsonb),
('Home Smart Plug', 'WiFi smart plug for home automation', 1990, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'home-accessories', 'Xiaomi', 'new', '{"wifi": "Yes", "app": "Yes"}'::jsonb),
('Smart Air Fryer', 'Digital air fryer with multiple cooking modes', 8990, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'home-appliances', 'Xiaomi', 'new', '{"capacity": "5.5L", "modes": "8"}'::jsonb),
('USB-C Hub', 'Multi-port USB-C hub with HDMI, 6 ports', 4990, 20, '/placeholder.svg', ARRAY['/placeholder.svg'], 'hubs-adapters', 'Baseus', 'new', '{"ports": "6", "hdmi": "Yes"}'::jsonb),
('iPad Stand', 'Adjustable stand for iPad and tablets', 1990, 25, '/placeholder.svg', ARRAY['/placeholder.svg'], 'ipad-tablet-accessories', 'Baseus', 'new', '{"adjustable": "Yes", "material": "Aluminum"}'::jsonb),
('Mechanical Keyboard', 'RGB mechanical keyboard with blue switches', 6990, 15, '/placeholder.svg', ARRAY['/placeholder.svg'], 'keyboards', 'Logitech', 'new', '{"switches": "Blue", "rgb": "Yes"}'::jsonb),
('Laptop Stand', 'Ergonomic laptop stand with cooling', 2990, 20, '/placeholder.svg', ARRAY['/placeholder.svg'], 'laptop-accessories', 'Baseus', 'new', '{"material": "Aluminum", "cooling": "Yes"}'::jsonb),
('Laptop Backpack', 'Professional laptop backpack, 15.6 inch', 3990, 18, '/placeholder.svg', ARRAY['/placeholder.svg'], 'laptop-bags', 'Baseus', 'new', '{"size": "15.6 inch", "pockets": "Multiple"}'::jsonb),
('Gaming Laptop', 'High-performance gaming laptop, RTX 4060', 149900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'laptops', 'ASUS', 'new', '{"gpu": "RTX 4060", "ram": "16GB"}'::jsonb),
('Logitech Mouse', 'Wireless gaming mouse with RGB lighting', 4990, 22, '/placeholder.svg', ARRAY['/placeholder.svg'], 'logitech', 'Logitech', 'new', '{"dpi": "16000", "wireless": "Yes"}'::jsonb),
('MacBook Case', 'Protective case for MacBook Pro 14"', 2990, 15, '/placeholder.svg', ARRAY['/placeholder.svg'], 'macbook-case', 'Baseus', 'new', '{"size": "14 inch", "material": "Hard Shell"}'::jsonb),
('USB Microphone', 'Professional USB microphone for streaming', 6990, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'microphones', 'Blue', 'new', '{"type": "USB", "pattern": "Cardioid"}'::jsonb),
('Wireless Mouse', 'Ergonomic wireless mouse for office', 1990, 35, '/placeholder.svg', ARRAY['/placeholder.svg'], 'mouse', 'Logitech', 'new', '{"dpi": "1000", "battery": "18 months"}'::jsonb),
('Notebook Laptop', 'Gaming notebook laptop, RTX 4070', 179900, 2, '/placeholder.svg', ARRAY['/placeholder.svg'], 'notebooks', 'ASUS', 'new', '{"gpu": "RTX 4070", "ram": "32GB"}'::jsonb),
('LED Party Light', 'RGB LED party light with music sync', 1990, 12, '/placeholder.svg', ARRAY['/placeholder.svg'], 'party-light', 'Generic', 'new', '{"colors": "RGB", "sync": "Music"}'::jsonb),
('Phone Cover Case', 'Protective phone cover with card slots', 1490, 60, '/placeholder.svg', ARRAY['/placeholder.svg'], 'phone-cover', 'Baseus', 'new', '{"protection": "Full", "slots": "3 cards"}'::jsonb),
('4K Projector', 'Portable 4K projector with WiFi', 29900, 4, '/placeholder.svg', ARRAY['/placeholder.svg'], 'projector', 'Xiaomi', 'new', '{"resolution": "4K", "wifi": "Yes"}'::jsonb),
('Realme Phone', 'Budget smartphone with good camera, 128GB', 19900, 25, '/placeholder.svg', ARRAY['/placeholder.svg'], 'realme-brand', 'Realme', 'new', '{"storage": "128GB", "ram": "6GB"}'::jsonb),
('Security Camera', 'WiFi security camera with night vision', 4990, 10, '/placeholder.svg', ARRAY['/placeholder.svg'], 'security-cameras', 'Xiaomi', 'new', '{"resolution": "1080p", "night_vision": "Yes"}'::jsonb),
('Smart Home Hub', 'Central hub for smart home devices', 8990, 6, '/placeholder.svg', ARRAY['/placeholder.svg'], 'smart-home', 'Xiaomi', 'new', '{"protocols": "WiFi, Zigbee", "devices": "100+"}'::jsonb),
('Sunglasses', 'UV protection sunglasses with polarized lenses', 2990, 20, '/placeholder.svg', ARRAY['/placeholder.svg'], 'sunglasses', 'Generic', 'new', '{"uv": "100%", "polarized": "Yes"}'::jsonb),
('Android Tablet', '10-inch Android tablet, 128GB', 19900, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'tablet', 'Samsung', 'new', '{"size": "10 inch", "storage": "128GB"}'::jsonb),
('Tablet Stand', 'Adjustable stand for tablets', 1490, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'tablet-accessories', 'Baseus', 'new', '{"adjustable": "Yes", "material": "Aluminum"}'::jsonb),
('Screen Protector', '9H tempered glass screen protector', 990, 100, '/placeholder.svg', ARRAY['/placeholder.svg'], 'tempered-glass', 'Baseus', 'new', '{"hardness": "9H", "clarity": "99%"}'::jsonb),
('Smart TV 55"', '4K Smart TV with Android TV, 55 inch', 89900, 3, '/placeholder.svg', ARRAY['/placeholder.svg'], 'tv', 'Xiaomi', 'new', '{"size": "55 inch", "resolution": "4K"}'::jsonb),
('Vacuum Cleaner', 'Cordless vacuum cleaner with HEPA filter', 19900, 5, '/placeholder.svg', ARRAY['/placeholder.svg'], 'vacuum-cleaner', 'Xiaomi', 'new', '{"type": "Cordless", "filter": "HEPA"}'::jsonb),
('Voice Recorder', 'Digital voice recorder with 16GB storage', 3990, 8, '/placeholder.svg', ARRAY['/placeholder.svg'], 'voice-recorder', 'Sony', 'new', '{"storage": "16GB", "battery": "20 hours"}'::jsonb),
('Fitness Tracker', 'Advanced fitness tracker with GPS', 4990, 15, '/placeholder.svg', ARRAY['/placeholder.svg'], 'wearable-technology', 'Xiaomi', 'new', '{"gps": "Yes", "battery": "14 days"}'::jsonb),
('Xiaomi Phone', 'Budget smartphone with MIUI, 128GB', 17900, 30, '/placeholder.svg', ARRAY['/placeholder.svg'], 'xiaomi-brand', 'Xiaomi', 'new', '{"storage": "128GB", "ram": "6GB"}'::jsonb);

-- Note: Some categories may have fewer products than their count suggests.
-- This is a seed file with at least one example per category.
-- You can add more products later through the admin panel.

