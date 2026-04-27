UPDATE venues
SET city = 'Unknown'
WHERE city IS NULL OR btrim(city) = '';

ALTER TABLE venues
  ALTER COLUMN city SET NOT NULL;
