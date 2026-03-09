-- Migration: 20260309_012_save_route_validate_campus_buildings
-- UP: Add campus and building validation to save_route RPC
-- Reversible via: supabase/migrations/down/20260309_012_save_route_validate_campus_buildings_down.sql
--
-- Problem: save_route accepts any UUID for campus_id, start_building_id, and
-- end_building_id without checking that the campus is active (not soft-deleted)
-- or that the buildings belong to that campus. The FK constraint catches
-- nonexistent UUIDs but not cross-campus references or deleted campuses.
--
-- Fix: Three validation checks after the permission gate, before any writes.

SET search_path TO public, extensions;

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

  IF jsonb_array_length(p_waypoints) = 0 THEN
    RAISE EXCEPTION 'no_waypoints';
  END IF;

  -- Validate campus exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM campuses WHERE id = p_campus_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'campus_not_found';
  END IF;

  -- Validate start building belongs to the supplied campus (when provided)
  IF p_start_building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM buildings WHERE id = p_start_building_id AND campus_id = p_campus_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'start_building_not_in_campus';
  END IF;

  -- Validate end building belongs to the supplied campus (when provided)
  IF p_end_building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM buildings WHERE id = p_end_building_id AND campus_id = p_campus_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'end_building_not_in_campus';
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
