-- Staging seed data for device verification (ALP-1000 through ALP-1003)
--
-- Run against the staging Supabase instance after applying all migrations:
--   supabase db push --project-ref $STAGING_PROJECT_REF
--   psql $STAGING_DB_URL -f supabase/seed_staging.sql
--
-- Or via the Supabase SQL Editor in the dashboard.
--
-- Prerequisites:
--   1. All migrations applied
--
-- This script is idempotent (uses ON CONFLICT DO NOTHING).

SET search_path TO public, extensions;

-- ============================================================
-- TEST USER: create the well-known seed admin directly in auth.users
-- ============================================================

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'seed-admin@echoecho.test',
  crypt('test1234', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '{"provider": "email", "providers": ["email"]}',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CLEANUP: delete previous seed data (dependency order)
-- ============================================================

DELETE FROM hazards    WHERE id IN ('00000000-0000-0000-0000-000000000300');
DELETE FROM waypoints  WHERE route_id IN ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000200');
DELETE FROM routes     WHERE id IN ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000200');
DELETE FROM pois       WHERE id IN ('00000000-0000-0000-0000-000000000030');
DELETE FROM building_entrances WHERE id IN ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023');
DELETE FROM buildings  WHERE id IN ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');
DELETE FROM campuses   WHERE id IN ('00000000-0000-0000-0000-000000000001');

-- ============================================================
-- CAMPUS: TSBVI (Texas School for the Blind and Visually Impaired)
-- ============================================================

INSERT INTO campuses (id, name, location, bounds, security_phone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'TSBVI',
  ST_SetSRID(ST_MakePoint(-97.7468, 30.3495), 4326),
  ST_SetSRID(
    ST_MakePolygon(
      ST_GeomFromText('LINESTRING(-97.7490 30.3475, -97.7445 30.3475, -97.7445 30.3515, -97.7490 30.3515, -97.7490 30.3475)')
    ),
    4326
  ),
  '+15124063100'
)
ON CONFLICT (id) DO UPDATE SET
  security_phone = EXCLUDED.security_phone;

-- ============================================================
-- BUILDINGS: 3 real TSBVI campus buildings
-- Coordinates are approximate centroids from satellite imagery.
-- ============================================================

-- Main Building (administration, classrooms)
INSERT INTO buildings (id, campus_id, name, outline, floors)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Main Building',
  ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
    'LINESTRING(-97.7472 30.3498, -97.7465 30.3498, -97.7465 30.3494, -97.7472 30.3494, -97.7472 30.3498)'
  )), 4326),
  2
)
ON CONFLICT (id) DO NOTHING;

-- Gymnasium
INSERT INTO buildings (id, campus_id, name, outline, floors)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'Gymnasium',
  ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
    'LINESTRING(-97.7458 30.3492, -97.7452 30.3492, -97.7452 30.3488, -97.7458 30.3488, -97.7458 30.3492)'
  )), 4326),
  1
)
ON CONFLICT (id) DO NOTHING;

-- Student Center (dining, common area)
INSERT INTO buildings (id, campus_id, name, outline, floors)
VALUES (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'Student Center',
  ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
    'LINESTRING(-97.7475 30.3490, -97.7470 30.3490, -97.7470 30.3487, -97.7475 30.3487, -97.7475 30.3490)'
  )), 4326),
  1
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- BUILDING ENTRANCES
-- ============================================================

-- Main Building entrances
INSERT INTO building_entrances (id, building_id, name, coordinate, is_main, accessibility_notes)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'Front Entrance',
    '{"latitude": 30.3496, "longitude": -97.7468}',
    true,
    'Automatic doors. Tactile guide strip from parking lot.'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000010',
    'Side Entrance (East)',
    '{"latitude": 30.3496, "longitude": -97.7465}',
    false,
    'Push door. Two steps with handrail on right.'
  )
ON CONFLICT (id) DO NOTHING;

-- Gymnasium entrance
INSERT INTO building_entrances (id, building_id, name, coordinate, is_main)
VALUES (
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000011',
  'Main Gym Doors',
  '{"latitude": 30.3490, "longitude": -97.7455}',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Student Center entrance
INSERT INTO building_entrances (id, building_id, name, coordinate, is_main, accessibility_notes)
VALUES (
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000012',
  'Main Entrance',
  '{"latitude": 30.3488, "longitude": -97.7472}',
  true,
  'Automatic sliding doors. Level entry.'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- POIS: Security office for emergency mode
-- ============================================================

INSERT INTO pois (id, campus_id, name, category, coordinate, description)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',
  'Campus Security Office',
  'security',
  '{"latitude": 30.3497, "longitude": -97.7470}',
  'Located in the Main Building lobby. 24/7 staffed.'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ROUTES: 2 published routes with waypoints
--
-- Route waypoints must be inserted via the save_route RPC (which
-- materializes path, total_distance_m, and content_hash). Since
-- this seed runs as raw SQL, we insert directly and compute the
-- derived columns manually.
-- ============================================================

-- Route 1: Main Building → Gymnasium
INSERT INTO routes (
  id, campus_id, name, from_label, to_label,
  start_building_id, end_building_id,
  difficulty, tags, status,
  recorded_by, recorded_at, recorded_duration_sec
)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001',
  'Main Building to Gymnasium',
  'Main Building', 'Gymnasium',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011',
  'easy', ARRAY['outdoor', 'accessible'], 'published',
  '00000000-0000-0000-0000-000000000099',
  now(), 180
)
ON CONFLICT (id) DO NOTHING;

-- Route 1 waypoints (5 points along the path)
INSERT INTO waypoints (id, route_id, position, recorded_at, geom, heading, annotation_text)
VALUES
  (
    '00000000-0000-0000-0000-000000000110',
    '00000000-0000-0000-0000-000000000100',
    1.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7468, 30.3496), 4326),
    135, 'Start at Main Building front entrance'
  ),
  (
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000100',
    2.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7465, 30.3495), 4326),
    120, 'Walk southeast along the covered walkway'
  ),
  (
    '00000000-0000-0000-0000-000000000112',
    '00000000-0000-0000-0000-000000000100',
    3.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7461, 30.3493), 4326),
    145, 'Turn slight right at the courtyard fountain'
  ),
  (
    '00000000-0000-0000-0000-000000000113',
    '00000000-0000-0000-0000-000000000100',
    4.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7457, 30.3491), 4326),
    160, 'Continue straight past the picnic tables'
  ),
  (
    '00000000-0000-0000-0000-000000000114',
    '00000000-0000-0000-0000-000000000100',
    5.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7455, 30.3490), 4326),
    NULL, 'Arrive at Gymnasium main doors'
  )
ON CONFLICT (id) DO NOTHING;

-- Materialize path and distance for Route 1
UPDATE routes SET
  path = (
    SELECT ST_MakeLine(geom ORDER BY position)
    FROM waypoints WHERE route_id = '00000000-0000-0000-0000-000000000100'
  ),
  total_distance_m = (
    SELECT ST_Length(ST_MakeLine(geom ORDER BY position)::geography)
    FROM waypoints WHERE route_id = '00000000-0000-0000-0000-000000000100'
  ),
  published_by = recorded_by,
  published_at = now()
WHERE id = '00000000-0000-0000-0000-000000000100';

-- Force content_hash recompute
DO $$ BEGIN PERFORM recompute_route_content_hash('00000000-0000-0000-0000-000000000100'); END $$;


-- Route 2: Main Building → Student Center
INSERT INTO routes (
  id, campus_id, name, from_label, to_label,
  start_building_id, end_building_id,
  difficulty, tags, status,
  recorded_by, recorded_at, recorded_duration_sec
)
VALUES (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000001',
  'Main Building to Student Center',
  'Main Building', 'Student Center',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000012',
  'easy', ARRAY['outdoor'], 'published',
  '00000000-0000-0000-0000-000000000099',
  now(), 120
)
ON CONFLICT (id) DO NOTHING;

-- Route 2 waypoints (4 points)
INSERT INTO waypoints (id, route_id, position, recorded_at, geom, heading, annotation_text)
VALUES
  (
    '00000000-0000-0000-0000-000000000210',
    '00000000-0000-0000-0000-000000000200',
    1.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7468, 30.3496), 4326),
    225, 'Start at Main Building front entrance'
  ),
  (
    '00000000-0000-0000-0000-000000000211',
    '00000000-0000-0000-0000-000000000200',
    2.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7470, 30.3493), 4326),
    200, 'Head southwest along the main path'
  ),
  (
    '00000000-0000-0000-0000-000000000212',
    '00000000-0000-0000-0000-000000000200',
    3.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7472, 30.3490), 4326),
    210, 'Turn slight left. Student Center ahead.'
  ),
  (
    '00000000-0000-0000-0000-000000000213',
    '00000000-0000-0000-0000-000000000200',
    4.0, now(),
    ST_SetSRID(ST_MakePoint(-97.7472, 30.3488), 4326),
    NULL, 'Arrive at Student Center main entrance'
  )
ON CONFLICT (id) DO NOTHING;

-- Materialize path and distance for Route 2
UPDATE routes SET
  path = (
    SELECT ST_MakeLine(geom ORDER BY position)
    FROM waypoints WHERE route_id = '00000000-0000-0000-0000-000000000200'
  ),
  total_distance_m = (
    SELECT ST_Length(ST_MakeLine(geom ORDER BY position)::geography)
    FROM waypoints WHERE route_id = '00000000-0000-0000-0000-000000000200'
  ),
  published_by = recorded_by,
  published_at = now()
WHERE id = '00000000-0000-0000-0000-000000000200';

DO $$ BEGIN PERFORM recompute_route_content_hash('00000000-0000-0000-0000-000000000200'); END $$;

-- ============================================================
-- HAZARDS: One test hazard on Route 1
-- ============================================================

INSERT INTO hazards (id, campus_id, route_id, type, severity, coordinate, title, description)
VALUES (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000100',
  'uneven_surface', 'medium',
  '{"latitude": 30.3493, "longitude": -97.7461, "altitude": 0}',
  'Broken sidewalk',
  'Raised concrete slab near courtyard fountain. Step up approximately 3cm.'
)
ON CONFLICT (id) DO NOTHING;
