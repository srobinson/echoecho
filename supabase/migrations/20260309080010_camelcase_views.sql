-- Migration: 20260309_010_camelcase_views
-- UP: Add missing columns to buildings/campuses/waypoints.
--     Create views that output camelCase column aliases and parsed PostGIS
--     geometry as JSONB objects matching the frontend TypeScript types.
--     Frontend reads from views; writes continue to raw tables.
--
-- All views use security_invoker = true so RLS policies from the underlying
-- tables are enforced through the calling user's context.

SET search_path TO public, extensions;

-- ============================================================
-- ADD MISSING COLUMNS
-- ============================================================

ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other'
    CHECK (category IN (
      'academic', 'residential', 'dining', 'administrative',
      'athletic', 'medical', 'utility', 'outdoor', 'other'
    )),
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE campuses
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS default_zoom int DEFAULT 16;

ALTER TABLE waypoints
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'regular'
    CHECK (type IN (
      'start', 'end', 'turn', 'decision_point', 'landmark',
      'hazard', 'door', 'elevator', 'stairs', 'ramp',
      'crossing', 'regular'
    ));

ALTER TABLE hazards
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);

-- ============================================================
-- v_campuses
-- ============================================================

CREATE OR REPLACE VIEW v_campuses WITH (security_invoker = true) AS
SELECT
  c.id,
  c.name,
  COALESCE(c.short_name, c.name) AS "shortName",
  jsonb_build_object(
    'latitude',  ST_Y(c.location::geometry),
    'longitude', ST_X(c.location::geometry)
  ) AS center,
  jsonb_build_object(
    'northEast', jsonb_build_object(
      'latitude',  ST_YMax(c.bounds::geometry),
      'longitude', ST_XMax(c.bounds::geometry)
    ),
    'southWest', jsonb_build_object(
      'latitude',  ST_YMin(c.bounds::geometry),
      'longitude', ST_XMin(c.bounds::geometry)
    )
  ) AS bounds,
  COALESCE(c.default_zoom, 16) AS "defaultZoom",
  c.security_phone AS "securityPhone",
  c.created_at AS "createdAt",
  c.updated_at AS "updatedAt"
FROM campuses c
WHERE c.deleted_at IS NULL;

-- ============================================================
-- v_buildings (entrances embedded as JSONB array)
-- ============================================================

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

-- ============================================================
-- v_waypoints
-- ============================================================

CREATE OR REPLACE VIEW v_waypoints WITH (security_invoker = true) AS
SELECT
  w.id,
  w.route_id AS "routeId",
  w.position AS "sequenceIndex",
  jsonb_build_object(
    'latitude',  ST_Y(w.geom),
    'longitude', ST_X(w.geom),
    'altitude',  NULL
  ) AS coordinate,
  COALESCE(w.type, 'regular') AS type,
  w.heading AS "headingOut",
  w.annotation_text AS "audioLabel",
  NULL::text AS description,
  w.photo_url AS "photoUrl",
  w.annotation_audio_url AS "audioAnnotationUrl",
  w.created_at AS "createdAt"
FROM waypoints w;

-- ============================================================
-- v_hazards
-- ============================================================

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

-- ============================================================
-- v_routes (waypoints + hazards embedded as JSONB arrays)
-- ============================================================

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
