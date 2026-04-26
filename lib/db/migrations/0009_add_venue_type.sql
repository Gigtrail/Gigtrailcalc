ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS venue_type text;

ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_venue_type_check;

ALTER TABLE venues
  ADD CONSTRAINT venues_venue_type_check
  CHECK (venue_type IS NULL OR venue_type IN ('personal', 'imported'));
