-- DOWN migration for 20260309_012_save_route_validate_campus_buildings
-- Restores save_route without campus/building validation checks.

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
