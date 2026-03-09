-- Migration: 20260309_018_match_route_clamp_limit
-- UP: Clamp p_limit parameter in match_route to [1, 20] range
-- Reversible via: supabase/migrations/down/20260309_018_match_route_clamp_limit_down.sql
--
-- Without this, callers can pass p_limit = 1000000 to request arbitrarily
-- large result sets. Clamping to 20 is generous for route matching; the
-- student app uses the default of 3.

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION match_route(
  p_lat              float,
  p_lng              float,
  p_destination_text text,
  p_campus_id        uuid,
  p_limit            int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_user_point           geography;
  v_nearest_building_id  uuid;
  v_nearest_building_name text;
  v_unmatched_destination boolean;
  v_matches              jsonb;
  v_campus_exists        boolean;
BEGIN
  -- Auth guard: reject unauthenticated requests.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;

  -- Clamp p_limit to a safe range
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    p_limit := 3;
  END IF;

  -- Validate campus exists.
  SELECT EXISTS(
    SELECT 1 FROM campuses WHERE id = p_campus_id AND deleted_at IS NULL
  ) INTO v_campus_exists;

  IF NOT v_campus_exists THEN
    RAISE EXCEPTION 'campus_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate coordinates are within valid WGS-84 bounds.
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'invalid_position' USING ERRCODE = 'P0003';
  END IF;

  v_user_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  SELECT b.id, b.name
  INTO v_nearest_building_id, v_nearest_building_name
  FROM buildings b
  WHERE b.campus_id = p_campus_id AND b.deleted_at IS NULL
  ORDER BY ST_Distance(v_user_point, b.outline::geography)
  LIMIT 1;

  SELECT NOT EXISTS (
    SELECT 1 FROM buildings
    WHERE campus_id  = p_campus_id
      AND deleted_at IS NULL
      AND similarity(name, p_destination_text) > 0.15
  ) INTO v_unmatched_destination;

  SELECT COALESCE(jsonb_agg(row_to_json(m.*) ORDER BY m.match_score DESC), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT
      r.id                                                    AS route_id,
      r.name                                                  AS route_name,
      r.start_building_id,
      sb.name                                                 AS start_building_name,
      r.end_building_id,
      eb.name                                                 AS end_building_name,
      r.difficulty,
      r.tags,
      r.total_distance_m,
      ROUND((r.total_distance_m / 1.2)::numeric, 0)::integer AS walk_time_estimate_s,
      mb.sim                                                  AS destination_similarity,
      ST_Distance(
        v_user_point,
        ST_StartPoint(r.path)::geography
      )                                                       AS distance_to_start_m,
      (mb.sim * 0.5)
        + (1.0 / GREATEST(r.total_distance_m, 1) * 0.3)
        + (CASE r.difficulty
             WHEN 'easy'     THEN 0.2
             WHEN 'moderate' THEN 0.1
             ELSE 0.0
           END)                                               AS match_score
    FROM routes r
    JOIN buildings sb ON sb.id = r.start_building_id
    JOIN buildings eb ON eb.id = r.end_building_id
    JOIN (
      SELECT id, name, similarity(name, p_destination_text) AS sim
      FROM buildings
      WHERE campus_id  = p_campus_id
        AND deleted_at IS NULL
        AND similarity(name, p_destination_text) > 0.15
    ) mb ON mb.id = r.end_building_id
    WHERE r.campus_id     = p_campus_id
      AND r.status        = 'published'
      AND r.deleted_at    IS NULL
      AND r.path          IS NOT NULL
      AND r.start_building_id = v_nearest_building_id
    ORDER BY match_score DESC
    LIMIT p_limit
  ) m;

  RETURN jsonb_build_object(
    'matches',                v_matches,
    'nearest_building_id',    v_nearest_building_id,
    'nearest_building_name',  v_nearest_building_name,
    'unmatched_destination',  v_unmatched_destination
  );
END;
$$;
