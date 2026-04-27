ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS source text;

CREATE TABLE IF NOT EXISTS venue_import_batches (
  id serial PRIMARY KEY,
  source_database text NOT NULL,
  file_name text NOT NULL,
  uploaded_by_user_id text REFERENCES users(id),
  total_rows integer NOT NULL DEFAULT 0,
  ready_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  needs_review_rows integer NOT NULL DEFAULT 0,
  missing_required_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venue_import_rows (
  id serial PRIMARY KEY,
  import_batch_id integer NOT NULL REFERENCES venue_import_batches(id) ON DELETE CASCADE,
  source_database text NOT NULL,
  source_sheet text,
  source_row_number integer,
  venue_name text,
  city_town text,
  country text,
  booking_email text,
  booking_contact_name text,
  booking_phone text,
  website text,
  facebook text,
  instagram text,
  notes text,
  raw_action text,
  duplicate_key text,
  import_status text NOT NULL DEFAULT 'unverified',
  duplicate_status text,
  matched_venue_id integer REFERENCES venues(id),
  raw_original_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_import_rows_import_status_check CHECK (
    import_status IN (
      'unverified',
      'ready_to_import',
      'needs_review',
      'duplicate',
      'missing_required',
      'imported',
      'skipped'
    )
  )
);

CREATE INDEX IF NOT EXISTS venue_import_rows_batch_id_idx
  ON venue_import_rows(import_batch_id);

CREATE INDEX IF NOT EXISTS venue_import_rows_status_idx
  ON venue_import_rows(import_status);

CREATE INDEX IF NOT EXISTS venue_import_rows_duplicate_key_idx
  ON venue_import_rows(duplicate_key);
