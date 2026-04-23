ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS venue_id integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'runs'
      AND column_name = 'venue_name'
  ) THEN
    UPDATE runs r
    SET venue_id = v.id
    FROM venues v
    WHERE r.venue_id IS NULL
      AND r.user_id = v.user_id
      AND trim(regexp_replace(
        regexp_replace(lower(coalesce(r.venue_name, '')), '[^a-z0-9[:space:]]', '', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )) = v.normalized_venue_name
      AND trim(coalesce(r.venue_name, '')) <> '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS runs_venue_id_idx ON runs (venue_id);
