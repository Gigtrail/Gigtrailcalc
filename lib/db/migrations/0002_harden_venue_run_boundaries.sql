ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS rider_friendly boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS typical_soundcheck_time text,
  ADD COLUMN IF NOT EXISTS typical_set_time text,
  ADD COLUMN IF NOT EXISTS general_notes text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'venues'
      AND column_name = 'rider_provided'
  ) THEN
    EXECUTE '
      UPDATE venues
      SET rider_friendly = COALESCE(rider_friendly, rider_provided)
      WHERE rider_friendly IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'venues'
      AND column_name = 'venue_notes'
  ) THEN
    EXECUTE '
      UPDATE venues
      SET general_notes = venue_notes
      WHERE general_notes IS NULL
        AND venue_notes IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'venues'
      AND column_name = 'room_notes'
  ) THEN
    EXECUTE '
      UPDATE venues
      SET general_notes = CASE
        WHEN general_notes IS NULL THEN room_notes
        WHEN room_notes IS NULL THEN general_notes
        ELSE general_notes || E''\n\n'' || room_notes
      END
      WHERE room_notes IS NOT NULL
    ';
  END IF;
END $$;

ALTER TABLE venues
  DROP COLUMN IF EXISTS actual_ticket_sales,
  DROP COLUMN IF EXISTS profit,
  DROP COLUMN IF EXISTS attendance,
  DROP COLUMN IF EXISTS last_total_profit,
  DROP COLUMN IF EXISTS last_status,
  DROP COLUMN IF EXISTS rider_provided,
  DROP COLUMN IF EXISTS venue_notes,
  DROP COLUMN IF EXISTS room_notes;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS attendance integer,
  ADD COLUMN IF NOT EXISTS actual_income numeric(10, 2),
  ADD COLUMN IF NOT EXISTS merch numeric(10, 2),
  ADD COLUMN IF NOT EXISTS show_notes text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'runs'
      AND column_name = 'actual_attendance'
  ) THEN
    EXECUTE '
      UPDATE runs
      SET attendance = actual_attendance
      WHERE attendance IS NULL
        AND actual_attendance IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'runs'
      AND column_name = 'actual_ticket_income'
  ) THEN
    EXECUTE '
      UPDATE runs
      SET actual_income = COALESCE(actual_income, 0)
        + COALESCE(actual_ticket_income, 0)
      WHERE actual_ticket_income IS NOT NULL
        AND actual_income IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'runs'
      AND column_name = 'actual_other_income'
  ) THEN
    EXECUTE '
      UPDATE runs
      SET merch = actual_other_income
      WHERE merch IS NULL
        AND actual_other_income IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'runs'
      AND column_name = 'notes'
  ) THEN
    EXECUTE '
      UPDATE runs
      SET show_notes = notes
      WHERE show_notes IS NULL
        AND notes IS NOT NULL
    ';
  END IF;
END $$;

ALTER TABLE runs
  DROP COLUMN IF EXISTS venue_name,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS actual_attendance,
  DROP COLUMN IF EXISTS actual_ticket_income,
  DROP COLUMN IF EXISTS actual_other_income,
  DROP COLUMN IF EXISTS actual_profit,
  DROP COLUMN IF EXISTS total_cost,
  DROP COLUMN IF EXISTS total_income,
  DROP COLUMN IF EXISTS total_profit,
  DROP COLUMN IF EXISTS calculation_snapshot,
  DROP COLUMN IF EXISTS notes;
