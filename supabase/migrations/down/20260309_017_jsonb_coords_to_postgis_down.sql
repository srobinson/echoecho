-- DOWN migration for 20260309_017_jsonb_coords_to_postgis
-- Drops the geom columns and sync triggers, restores original views.

SET search_path TO public, extensions;

-- Drop triggers
DROP TRIGGER IF EXISTS hazards_sync_geom ON hazards;
DROP TRIGGER IF EXISTS pois_sync_geom ON pois;
DROP TRIGGER IF EXISTS building_entrances_sync_geom ON building_entrances;

-- Drop indexes and geom columns
DROP INDEX IF EXISTS hazards_geom_idx;
ALTER TABLE hazards DROP COLUMN IF EXISTS geom;

DROP INDEX IF EXISTS pois_geom_idx;
ALTER TABLE pois DROP COLUMN IF EXISTS geom;

DROP INDEX IF EXISTS building_entrances_geom_idx;
ALTER TABLE building_entrances DROP COLUMN IF EXISTS geom;

-- Drop shared trigger function
DROP FUNCTION IF EXISTS sync_geom_from_coordinate();

-- Restore original views using coordinate JSONB directly
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
    (SELECT be.coordinate
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
       'coordinate',          be.coordinate,
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

CREATE OR REPLACE VIEW v_hazards WITH (security_invoker = true) AS
SELECT
  h.id,
  h.campus_id AS "campusId",
  h.route_id AS "routeId",
  h.waypoint_id AS "waypointId",
  h.type,
  h.severity,
  h.coordinate,
  h.title,
  h.description,
  h.expires_at AS "expiresAt",
  h.resolved_at AS "resolvedAt",
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt"
FROM hazards h
WHERE h.resolved_at IS NULL;

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
       'coordinate',  h.coordinate,
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
