ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS production_contact_name text,
  ADD COLUMN IF NOT EXISTS production_contact_phone text,
  ADD COLUMN IF NOT EXISTS production_contact_email text;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS actual_ticket_sales integer,
  ADD COLUMN IF NOT EXISTS soundcheck_time text,
  ADD COLUMN IF NOT EXISTS playing_time text;

-- Preserve any legacy venue-level ticket sales by moving the value to the
-- newest linked run for that venue when that run does not already have sales.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'venues'
      AND column_name = 'actual_ticket_sales'
  ) THEN
    EXECUTE '
      WITH latest_linked_run AS (
        SELECT DISTINCT ON (r.venue_id)
          r.id AS run_id,
          v.actual_ticket_sales
        FROM runs r
        JOIN venues v ON v.id = r.venue_id
        WHERE v.actual_ticket_sales IS NOT NULL
          AND r.actual_ticket_sales IS NULL
        ORDER BY r.venue_id, r.show_date DESC NULLS LAST, r.created_at DESC
      )
      UPDATE runs r
      SET actual_ticket_sales = latest_linked_run.actual_ticket_sales
      FROM latest_linked_run
      WHERE r.id = latest_linked_run.run_id
    ';
  END IF;
END $$;

ALTER TABLE venues
  DROP COLUMN IF EXISTS actual_ticket_sales;
