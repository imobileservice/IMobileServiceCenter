-- Migration: Add 'With Frame' and 'Multi Display' to Quality options
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard -> SQL Editor)

UPDATE categories
SET field_config = jsonb_set(
  field_config,
  '{fields}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN f->>'key' = 'quality' THEN 
          jsonb_set(f, '{options}', '["Original", "Compatible", "OLED", "Incell", "With Frame", "Multi Display"]'::jsonb)
        ELSE f
      END
    )
    FROM jsonb_array_elements(field_config->'fields') AS f
  )
)
WHERE field_config @> '{"fields": [{"key": "quality"}]}';
