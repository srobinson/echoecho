-- Migration: 20260309_017_jsonb_coords_to_postgis
-- UP: Add PostGIS geometry(Point, 4326) columns alongside existing JSONB
--     coordinate columns on hazards, pois, and building_entrances. A trigger
--     keeps geom in sync with coordinate on INSERT/UPDATE. Views are updated
--     to use geom for spatial operations while the JSONB column remains for
--     API compatibility (the admin app inserts coordinate as JSONB directly).
-- Reversible via: supabase/migrations/down/20260309_017_jsonb_coords_to_postgis_down.sql

SET search_path TO public, extensions;

-- ============================================================
-- Shared trigger function: sync geom from coordinate JSONB on write.
-- Reusable across all three tables.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_geom_from_coordinate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.coordinate IS NOT NULL THEN
    NEW.geom := ST_SetSRID(
      ST_MakePoint(
        (NEW.coordinate->>'longitude')::float,
        (NEW.coordinate->>'latitude')::float
      ), 4326
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. HAZARDS
-- ============================================================

ALTER TABLE hazards ADD COLUMN geom geometry(Point, 4326);

UPDATE hazards SET geom = ST_SetSRID(
  ST_MakePoint(
    (coordinate->>'longitude')::float,
    (coordinate->>'latitude')::float
  ), 4326
) WHERE coordinate IS NOT NULL;

CREATE INDEX hazards_geom_idx ON hazards USING GIST(geom);

CREATE TRIGGER hazards_sync_geom
  BEFORE INSERT OR UPDATE OF coordinate ON hazards
  FOR EACH ROW EXECUTE FUNCTION sync_geom_from_coordinate();

-- ============================================================
-- 2. POIS
-- ============================================================

ALTER TABLE pois ADD COLUMN geom geometry(Point, 4326);

UPDATE pois SET geom = ST_SetSRID(
  ST_MakePoint(
    (coordinate->>'longitude')::float,
    (coordinate->>'latitude')::float
  ), 4326
) WHERE coordinate IS NOT NULL;

CREATE INDEX pois_geom_idx ON pois USING GIST(geom);

CREATE TRIGGER pois_sync_geom
  BEFORE INSERT OR UPDATE OF coordinate ON pois
  FOR EACH ROW EXECUTE FUNCTION sync_geom_from_coordinate();

-- ============================================================
-- 3. BUILDING_ENTRANCES
-- ============================================================

ALTER TABLE building_entrances ADD COLUMN geom geometry(Point, 4326);

UPDATE building_entrances SET geom = ST_SetSRID(
  ST_MakePoint(
    (coordinate->>'longitude')::float,
    (coordinate->>'latitude')::float
  ), 4326
) WHERE coordinate IS NOT NULL;

CREATE INDEX building_entrances_geom_idx ON building_entrances USING GIST(geom);

CREATE TRIGGER building_entrances_sync_geom
  BEFORE INSERT OR UPDATE OF coordinate ON building_entrances
  FOR EACH ROW EXECUTE FUNCTION sync_geom_from_coordinate();

-- ============================================================
-- 4. RECREATE VIEWS to use geom for spatial operations.
--    The JSONB coordinate column is still readable by clients, but
--    spatial queries can now use the geom column with GiST indexes.
-- ============================================================

-- v_buildings: use geom for mainEntrance and entrance coordinates
CREATE OR REPLACE VIEW v_buildings WITH (security_invoker = true) AS
SELECT
  b.id,
  b.campus_id AS "campusId",
  b.name,
  COALESCE(b.short_name, b.name) AS "shortName",
  COALESCE(b.category, 'other') AS category,
  b.description,
  (ST_AsGeoJSON(b.outline)::jsonb -> 'coordinates' -> 0) AS footprint,
  COALESCE(
    (SELECT jsonb_build_object(
       'latitude',  ST_Y(be.geom),
       'longitude', ST_X(be.geom)
     )
     FROM building_entrances be
     WHERE be.building_id = b.id AND be.is_main = true
     LIMIT 1),
    jsonb_build_object(
      'latitude',  ST_Y(ST_Centroid(b.outline)),
      'longitude', ST_X(ST_Centroid(b.outline))
    )
  ) AS "mainEntrance",
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
       'id',                  be.id,
       'buildingId',          be.building_id,
       'name',                be.name,
       'coordinate',          jsonb_build_object(
         'latitude',  ST_Y(be.geom),
         'longitude', ST_X(be.geom)
       ),
       'isMain',              be.is_main,
       'accessibilityNotes',  be.accessibility_notes
     ) ORDER BY be.is_main DESC, be.name)
     FROM building_entrances be
     WHERE be.building_id = b.id),
    '[]'::jsonb
  ) AS entrances,
  b.floors AS floor,
  b.created_at AS "createdAt",
  b.updated_at AS "updatedAt"
FROM buildings b
WHERE b.deleted_at IS NULL;

-- v_hazards: use geom for coordinate output
CREATE OR REPLACE VIEW v_hazards WITH (security_invoker = true) AS
SELECT
  h.id,
  h.campus_id AS "campusId",
  h.route_id AS "routeId",
  h.waypoint_id AS "waypointId",
  h.type,
  h.severity,
  jsonb_build_object(
    'latitude',  ST_Y(h.geom),
    'longitude', ST_X(h.geom)
  ) AS coordinate,
  h.title,
  h.description,
  h.expires_at AS "expiresAt",
  h.resolved_at AS "resolvedAt",
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt"
FROM hazards h
WHERE h.resolved_at IS NULL;

-- v_routes: use geom for hazard coordinates in embedded JSONB
CREATE OR REPLACE VIEW v_routes WITH (security_invoker = true) AS
SELECT
  r.id,
  r.campus_id AS "campusId",
  r.name,
  r.description,
  r.start_building_id AS "fromBuildingId",
  r.end_building_id   AS "toBuildingId",
  r.from_label AS "fromLabel",
  r.to_label   AS "toLabel",
  r.status,
  r.total_distance_m        AS "distanceMeters",
  r.recorded_duration_sec   AS "recordedDurationSec",
  r.recorded_by::text       AS "recordedBy",
  r.recorded_at             AS "recordedAt",
  r.created_at              AS "createdAt",
  r.updated_at              AS "updatedAt",
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
       'id',                  w.id,
       'routeId',             w.route_id,
       'sequenceIndex',       w.position,
       'coordinate',          jsonb_build_object(
         'latitude',  ST_Y(w.geom),
         'longitude', ST_X(w.geom),
         'altitude',  NULL
       ),
       'type',                COALESCE(w.type, 'regular'),
       'headingOut',          w.heading,
       'audioLabel',          w.annotation_text,
       'description',         NULL,
       'photoUrl',            w.photo_url,
       'audioAnnotationUrl',  w.annotation_audio_url,
       'createdAt',           w.created_at
     ) ORDER BY w.position)
     FROM waypoints w
     WHERE w.route_id = r.id),
    '[]'::jsonb
  ) AS waypoints,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
       'id',          h.id,
       'campusId',    h.campus_id,
       'routeId',     h.route_id,
       'waypointId',  h.waypoint_id,
       'type',        h.type,
       'severity',    h.severity,
       'coordinate',  jsonb_build_object(
         'latitude',  ST_Y(h.geom),
         'longitude', ST_X(h.geom)
       ),
       'title',       h.title,
       'description', h.description,
       'expiresAt',   h.expires_at,
       'createdAt',   h.created_at,
       'updatedAt',   h.updated_at
     ))
     FROM hazards h
     WHERE h.route_id = r.id AND h.resolved_at IS NULL),
    '[]'::jsonb
  ) AS hazards
FROM routes r
WHERE r.deleted_at IS NULL;
