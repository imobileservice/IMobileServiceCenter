-- Create filters table
CREATE TABLE IF NOT EXISTS filters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL, -- The key used in products.specs or product columns
  type TEXT NOT NULL CHECK (type IN ('select', 'multiselect', 'range', 'checkbox', 'text', 'number')),
  options JSONB, -- For select/multiselect: ["Option 1", "Option 2"] or [{"label": "Red", "value": "red"}]
  min_value DECIMAL, -- For range
  max_value DECIMAL, -- For range
  step DECIMAL DEFAULT 1, -- For range
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(key, type) -- Avoid duplicate filter definitions for same key/type combo if possible, but maybe allow if different configs? Let's just index key.
);

CREATE INDEX IF NOT EXISTS idx_filters_key ON filters(key);
CREATE INDEX IF NOT EXISTS idx_filters_active ON filters(is_active);

-- Create junction table for filters and categories
CREATE TABLE IF NOT EXISTS filter_categories (
  filter_id UUID REFERENCES filters(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  PRIMARY KEY (filter_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_filter_categories_filter_id ON filter_categories(filter_id);
CREATE INDEX IF NOT EXISTS idx_filter_categories_category_id ON filter_categories(category_id);

-- Enable RLS
ALTER TABLE filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE filter_categories ENABLE ROW LEVEL SECURITY;

-- Policies for filters
-- Everyone can view active filters
CREATE POLICY "Filters are viewable by everyone" ON filters
  FOR SELECT USING (true);

-- Only admins can manage filters
CREATE POLICY "Only admins can manage filters" ON filters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- Policies for filter_categories
-- Everyone can view
CREATE POLICY "Filter categories are viewable by everyone" ON filter_categories
  FOR SELECT USING (true);

-- Only admins can manage
CREATE POLICY "Only admins can manage filter categories" ON filter_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND email = 'imobile.admin@gmail.com'
    )
  );

-- Function to auto-update updated_at for filters
DROP TRIGGER IF EXISTS update_filters_updated_at ON filters;
CREATE TRIGGER update_filters_updated_at BEFORE UPDATE ON filters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
