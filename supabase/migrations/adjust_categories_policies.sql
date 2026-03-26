-- Relax categories RLS to allow authenticated admins (front-end) to manage categories

-- Drop legacy policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'categories'
      AND policyname = 'Only admins can manage categories'
  ) THEN
    DROP POLICY "Only admins can manage categories" ON categories;
  END IF;
END
$$;

-- Allow any authenticated Supabase user to manage categories
CREATE POLICY IF NOT EXISTS "Authenticated can manage categories" ON categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


