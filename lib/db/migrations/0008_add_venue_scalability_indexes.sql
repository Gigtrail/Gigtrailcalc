ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS normalized_venue_key text;

UPDATE venues
SET normalized_venue_key =
  lower(trim(coalesce(venue_name, ''))) || '|' ||
  lower(trim(coalesce(city, ''))) || '|' ||
  lower(trim(coalesce(country, '')))
WHERE normalized_venue_key IS NULL;

CREATE INDEX IF NOT EXISTS venues_user_id_idx
  ON venues(user_id);

CREATE INDEX IF NOT EXISTS venues_updated_at_idx
  ON venues(updated_at);

CREATE INDEX IF NOT EXISTS venues_country_idx
  ON venues(country);

CREATE INDEX IF NOT EXISTS venues_normalized_venue_name_idx
  ON venues(normalized_venue_name);

CREATE INDEX IF NOT EXISTS venues_city_idx
  ON venues(city);

CREATE INDEX IF NOT EXISTS venues_state_idx
  ON venues(state);

CREATE INDEX IF NOT EXISTS venues_normalized_venue_key_idx
  ON venues(normalized_venue_key);
