-- Advanced database functions for enhanced operations

-- Function to update product stock atomically
CREATE OR REPLACE FUNCTION update_product_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS products AS $$
DECLARE
  updated_product products;
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock + p_quantity),
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING * INTO updated_product;
  
  RETURN updated_product;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer statistics
CREATE OR REPLACE FUNCTION get_customer_stats(p_user_id UUID)
RETURNS TABLE (
  total_orders INTEGER,
  total_spent NUMERIC,
  average_order_value NUMERIC,
  last_order_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_orders,
    COALESCE(SUM(total), 0)::NUMERIC as total_spent,
    COALESCE(AVG(total), 0)::NUMERIC as average_order_value,
    MAX(created_at) as last_order_date
  FROM orders
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get product recommendations based on category and brand
CREATE OR REPLACE FUNCTION get_product_recommendations(
  p_product_id UUID,
  p_limit INTEGER DEFAULT 4
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  price NUMERIC,
  image TEXT,
  rating NUMERIC
) AS $$
DECLARE
  v_category TEXT;
  v_brand TEXT;
BEGIN
  -- Get product's category and brand
  SELECT category, brand INTO v_category, v_brand
  FROM products
  WHERE id = p_product_id;

  -- Return recommendations
  RETURN QUERY
  SELECT p.id, p.name, p.price, p.image, p.rating
  FROM products p
  WHERE p.id != p_product_id
    AND (
      p.category = v_category
      OR (v_brand IS NOT NULL AND p.brand = v_brand)
    )
  ORDER BY p.rating DESC, p.reviews_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate order total (can be used in triggers)
CREATE OR REPLACE FUNCTION calculate_order_total(p_order_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(price * quantity), 0) INTO v_total
  FROM order_items
  WHERE order_id = p_order_id;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- Function to get low stock products
CREATE OR REPLACE FUNCTION get_low_stock_products(p_threshold INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  stock INTEGER,
  category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.stock, p.category
  FROM products p
  WHERE p.stock <= p_threshold AND p.stock > 0
  ORDER BY p.stock ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to search products with ranking
CREATE OR REPLACE FUNCTION search_products(
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  price NUMERIC,
  image TEXT,
  relevance_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    p.image,
    CASE
      WHEN p.name ILIKE '%' || p_search_query || '%' THEN 3
      WHEN p.brand ILIKE '%' || p_search_query || '%' THEN 2
      WHEN p.description ILIKE '%' || p_search_query || '%' THEN 1
      ELSE 0
    END as relevance_score
  FROM products p
  WHERE
    p.name ILIKE '%' || p_search_query || '%'
    OR p.description ILIKE '%' || p_search_query || '%'
    OR p.brand ILIKE '%' || p_search_query || '%'
  ORDER BY relevance_score DESC, p.rating DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update order total when order_items change
CREATE OR REPLACE FUNCTION update_order_total_trigger()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET
    subtotal = calculate_order_total(
      COALESCE(NEW.order_id, OLD.order_id)
    ),
    total = subtotal + COALESCE(shipping, 0) + COALESCE(tax, 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_update_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_total_trigger();

-- Function to get sales analytics
CREATE OR REPLACE FUNCTION get_sales_analytics(
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_orders INTEGER,
  average_order_value NUMERIC,
  top_product_id UUID,
  top_product_name TEXT,
  top_product_sales INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH order_stats AS (
    SELECT
      SUM(total) as revenue,
      COUNT(*)::INTEGER as orders,
      AVG(total) as avg_order
    FROM orders
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND status != 'cancelled'
  ),
  product_sales AS (
    SELECT
      oi.product_id,
      SUM(oi.quantity) as total_sold
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at BETWEEN p_start_date AND p_end_date
      AND o.status != 'cancelled'
    GROUP BY oi.product_id
    ORDER BY total_sold DESC
    LIMIT 1
  )
  SELECT
    os.revenue as total_revenue,
    os.orders as total_orders,
    os.avg_order as average_order_value,
    ps.product_id as top_product_id,
    p.name as top_product_name,
    ps.total_sold::INTEGER as top_product_sales
  FROM order_stats os
  LEFT JOIN product_sales ps ON true
  LEFT JOIN products p ON p.id = ps.product_id;
END;
$$ LANGUAGE plpgsql;
