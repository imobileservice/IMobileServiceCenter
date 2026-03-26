-- USE THIS SCRIPT CAREFULLY!
-- It deletes all test orders, messages, and customer data from the database.
-- It keeps products, categories, filters, hero slides, and admin settings intact.

-- 1. Delete all order items (must be deleted before orders due to foreign key constraints)
TRUNCATE TABLE order_items CASCADE;

-- 2. Delete all orders
TRUNCATE TABLE orders CASCADE;

-- 3. Delete all shopping cart sessions/items
TRUNCATE TABLE cart_items CASCADE;
TRUNCATE TABLE carts CASCADE;

-- 4. Delete all contact messages
TRUNCATE TABLE messages CASCADE;

-- 5. Delete all test users/customers from the public schema
-- (Note: You still need to delete them from Authentication -> Users in the Supabase Dashboard)
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE user_sessions CASCADE;

-- Optional: If you also want to remove test products/categories/slides, uncomment these:
-- TRUNCATE TABLE products CASCADE;
-- TRUNCATE TABLE categories CASCADE;
-- TRUNCATE TABLE hero_slides CASCADE;
