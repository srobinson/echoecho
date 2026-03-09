-- DOWN migration for 20260309_021_v_routes_cte_rewrite
-- Restores the correlated-subquery version of v_routes from migration 017.

SET search_path TO public, extensions;

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
       'coordinate',  CASE WHEN h.geom IS NOT NULL THEN jsonb_build_object(
         'latitude',  ST_Y(h.geom),
         'longitude', ST_X(h.geom)
       ) ELSE NULL END,
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
