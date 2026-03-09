-- Seed: development data for local Supabase instance
-- Applied automatically by `supabase db reset`
-- Do NOT run against staging or production.

-- TSBVI campus (Texas School for the Blind and Visually Impaired, Austin TX)
INSERT INTO campuses (id, name, location, bounds)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'TSBVI',
  ST_SetSRID(ST_MakePoint(-97.7468, 30.3495), 4326),
  ST_SetSRID(
    ST_MakePolygon(
      ST_GeomFromText('LINESTRING(-97.7490 30.3475, -97.7445 30.3475, -97.7445 30.3515, -97.7490 30.3515, -97.7490 30.3475)')
    ),
    4326
  )
);
