-- Migration: 20260309_004_route_save_rpcs
-- UP: Add missing route columns; create save_route, publish_route, retract_route,
--     and create_building_stub RPCs
-- Reversible via: supabase/migrations/down/20260309_004_route_save_rpcs_down.sql

-- ============================================================
-- ADD MISSING COLUMNS TO ROUTES
-- These are in the shared Route type but were absent from the initial schema.
-- ============================================================

ALTER TABLE routes
  ADD COLUMN from_label            text NOT NULL DEFAULT '',
  ADD COLUMN to_label              text NOT NULL DEFAULT '',
  ADD COLUMN recorded_duration_sec integer,
  ADD COLUMN recorded_at           timestamptz;

-- Remove the DEFAULT '' added to satisfy NOT NULL during ALTER;
-- existing rows get '' which is correct.
ALTER TABLE routes ALTER COLUMN from_label DROP DEFAULT;
ALTER TABLE routes ALTER COLUMN to_label   DROP DEFAULT;


-- ============================================================
-- create_building_stub
-- Creates a minimal placeholder building (10m² bounding box) so O&M
-- specialists can save a route before the admin panel (ALP-966) is
-- available to draw the real footprint. The stub is replaced by ALP-966.
-- ============================================================

CREATE OR REPLACE FUNCTION create_building_stub(
  p_campus_id uuid,
  p_name      text,
  p_lat       float,
  p_lng       float
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_building_id uuid;
  -- ~10 metres in degrees at mid-latitudes (~0.00009°)
  v_delta       float := 0.00009;
  v_outline     geometry;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist', 'volunteer')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_outline := ST_SetSRID(
    ST_MakePolygon(
      ST_GeomFromText(format(
        'LINESTRING(%s %s, %s %s, %s %s, %s %s, %s %s)',
        p_lng - v_delta, p_lat - v_delta,
        p_lng + v_delta, p_lat - v_delta,
        p_lng + v_delta, p_lat + v_delta,
        p_lng - v_delta, p_lat + v_delta,
        p_lng - v_delta, p_lat - v_delta
      ))
    ),
    4326
  );

  INSERT INTO buildings (campus_id, name, outline)
  VALUES (p_campus_id, p_name, v_outline)
  RETURNING id INTO v_building_id;

  RETURN v_building_id;
END;
$$;


-- ============================================================
-- save_route
-- Atomic route save in a single Postgres transaction:
--   a. INSERT routes with status = 'pending_save'
--   b. INSERT all waypoints (content_hash trigger fires per-row)
--   c. UPDATE routes: materialise path + total_distance_m, set status = 'draft'
--
-- Storage uploads (audio, photos) must complete BEFORE calling this function.
-- If this function fails after storage uploads succeeded, the orphaned Storage
-- objects are purged by the nightly cleanup Edge Function (ALP-942).
--
-- p_waypoints JSON shape per element:
--   { position, captured_at, latitude, longitude,
--     heading?, annotation_text?, annotation_audio_url?, photo_url? }
-- ============================================================

CREATE OR REPLACE FUNCTION save_route(
  p_campus_id              uuid,
  p_name                   text,
  p_from_label             text,
  p_to_label               text,
  p_start_building_id      uuid,
  p_end_building_id        uuid,
  p_difficulty             text,
  p_tags                   text[],
  p_recorded_duration_sec  integer,
  p_waypoints              jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_route_id uuid;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist', 'volunteer')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- a. INSERT route row; status starts as 'pending_save' so it is invisible
  --    to all list/map queries while the transaction is open.
  INSERT INTO routes (
    campus_id, name, from_label, to_label,
    start_building_id, end_building_id,
    difficulty, tags, status,
    recorded_by, recorded_at, recorded_duration_sec
  ) VALUES (
    p_campus_id, p_name, p_from_label, p_to_label,
    p_start_building_id, p_end_building_id,
    p_difficulty, p_tags, 'pending_save',
    auth.uid(), now(), p_recorded_duration_sec
  )
  RETURNING id INTO v_route_id;

  -- b. INSERT waypoints from the JSONB array.
  --    The waypoints_content_hash trigger fires after each row, keeping
  --    content_hash current. Heading is nullable (NULL when speed < 0.5 m/s).
  INSERT INTO waypoints (
    route_id, position, recorded_at, geom,
    heading, annotation_text, annotation_audio_url, photo_url
  )
  SELECT
    v_route_id,
    (wp->>'position')::float,
    to_timestamp((wp->>'captured_at')::bigint / 1000.0),
    ST_SetSRID(
      ST_MakePoint(
        (wp->>'longitude')::float,
        (wp->>'latitude')::float
      ),
      4326
    ),
    CASE
      WHEN wp->>'heading' IS NOT NULL AND wp->>'heading' != 'null'
      THEN (wp->>'heading')::float
      ELSE NULL
    END,
    NULLIF(wp->>'annotation_text', ''),
    NULLIF(wp->>'annotation_audio_url', ''),
    NULLIF(wp->>'photo_url', '')
  FROM jsonb_array_elements(p_waypoints) AS wp;

  -- c. Materialise LineString path and total distance; transition to 'draft'.
  --    ST_MakeLine aggregates ordered waypoint geometries.
  --    content_hash was maintained by the per-row trigger in step b.
  UPDATE routes SET
    path = (
      SELECT ST_MakeLine(geom ORDER BY position)
      FROM   waypoints
      WHERE  route_id = v_route_id
    ),
    total_distance_m = (
      SELECT ST_Length(
        ST_MakeLine(geom ORDER BY position)::geography
      )
      FROM   waypoints
      WHERE  route_id = v_route_id
    ),
    status     = 'draft',
    updated_at = now()
  WHERE id = v_route_id;

  RETURN v_route_id;
END;
$$;


-- ============================================================
-- publish_route / retract_route
-- Callable by admin and om_specialist only (application-layer check is
-- defense-in-depth; RLS on the routes table is the primary enforcement).
-- ============================================================

CREATE OR REPLACE FUNCTION publish_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE routes SET
    status       = 'published',
    published_by = auth.uid(),
    published_at = now(),
    updated_at   = now()
  WHERE id = route_id AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_draft';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION retract_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE routes SET
    status     = 'retracted',
    updated_at = now()
  WHERE id = route_id AND status = 'published';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_published';
  END IF;
END;
$$;
