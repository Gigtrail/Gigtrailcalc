ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS production_notes text,
  ADD COLUMN IF NOT EXISTS tech_specs text,
  ADD COLUMN IF NOT EXISTS stage_plot_notes text;
