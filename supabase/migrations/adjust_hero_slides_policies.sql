-- Adjust RLS policies for hero_slides to allow authenticated users (e.g. admin panel via anon key)

-- Drop old admin-only policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hero_slides'
      AND policyname = 'Admins can manage hero slides'
  ) THEN
    DROP POLICY "Admins can manage hero slides" ON hero_slides;
  END IF;
END
$$;

-- Create a new policy: any authenticated user can manage hero_slides
-- (Admin panel already lives behind its own auth)
CREATE POLICY IF NOT EXISTS "Authenticated can manage hero slides" ON hero_slides
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


