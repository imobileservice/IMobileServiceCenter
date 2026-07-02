-- Adds the 6-hour POS till session expiry for databases that already
-- applied the initial till-session migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pos_till_sessions'
  ) THEN
    ALTER TABLE pos_till_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

    UPDATE pos_till_sessions
    SET expires_at = COALESCE(expires_at, opened_at + interval '6 hours', now() + interval '6 hours');

    ALTER TABLE pos_till_sessions ALTER COLUMN expires_at SET DEFAULT (now() + interval '6 hours');
    ALTER TABLE pos_till_sessions ALTER COLUMN expires_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_pos_till_sessions_expires_at ON pos_till_sessions(expires_at);
  END IF;
END $$;
