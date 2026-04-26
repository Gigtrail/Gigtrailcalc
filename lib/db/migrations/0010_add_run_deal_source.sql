ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS deal_source text;

ALTER TABLE runs
  DROP CONSTRAINT IF EXISTS runs_deal_source_check;

ALTER TABLE runs
  ADD CONSTRAINT runs_deal_source_check
  CHECK (deal_source IS NULL OR deal_source IN ('single_show', 'tour_show', 'manual', 'import'));

UPDATE runs
SET deal_source = CASE
  WHEN imported_from_tour = true OR source_tour_id IS NOT NULL OR source_stop_id IS NOT NULL THEN 'tour_show'
  ELSE 'single_show'
END
WHERE deal_source IS NULL;
