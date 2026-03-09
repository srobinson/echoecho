-- Migration: 20260309_005_match_route_rpc
-- UP: Add match_route Postgres function for student route discovery
-- Reversible via: supabase/migrations/down/20260309_005_match_route_rpc_down.sql
--
-- Dependencies (all present from migration 001):

SET search_path TO public, extensions;
--   - pg_trgm extension
--   - GIN trigram index on buildings.name
--   - GiST index on buildings.outline
--   - GiST index on routes.path
--   - routes.content_hash, routes.path, routes.total_distance_m

-- ============================================================
-- match_route
-- Returns ranked published routes from the user's nearest building
-- to buildings whose name fuzzy-matches the destination text.
--
-- Composite ranking score (weights are fixed constants; see ALP-955 notes
-- on validation with VI users before treating as stable):
--   0.5 × destination name similarity (pg_trgm)
--   0.3 × inverse route distance (shorter = more accessible)
--   0.2 × difficulty bonus (easy > moderate > hard)
--
-- Fuzzy match threshold: similarity > 0.15. Below this threshold,
-- unmatched_destination = true is returned; the student app should
-- prompt the user to repeat or spell the destination.
--
-- Auth: any authenticated user (anon key rejected). Students are the
-- primary callers; admin/om_specialist/volunteer access is also permitted.
-- ============================================================

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
  -- SECURITY DEFINER bypasses RLS, so we must enforce auth explicitly.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
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

  -- Nearest building to the user's position. NULL if campus has no buildings.
  -- Uses GiST index on buildings.outline for sub-millisecond lookup.
  SELECT b.id, b.name
  INTO v_nearest_building_id, v_nearest_building_name
  FROM buildings b
  WHERE b.campus_id = p_campus_id AND b.deleted_at IS NULL
  ORDER BY ST_Distance(v_user_point, b.outline::geography)
  LIMIT 1;

  -- Check whether any building name matches the destination text.
  -- Returns true when all similarities fall below the 0.15 threshold.
  -- Uses GIN trigram index on buildings.name.
  SELECT NOT EXISTS (
    SELECT 1 FROM buildings
    WHERE campus_id  = p_campus_id
      AND deleted_at IS NULL
      AND similarity(name, p_destination_text) > 0.15
  ) INTO v_unmatched_destination;

  -- Build ranked route matches.
  -- Only routes starting from the user's nearest building are considered;
  -- see ALP-955 notes on the nearest-building assumption limitation.
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
      -- Walk time at average 1.2 m/s; rounded to nearest second
      ROUND((r.total_distance_m / 1.2)::numeric, 0)::integer AS walk_time_estimate_s,
      mb.sim                                                  AS destination_similarity,
      ST_Distance(
        v_user_point,
        ST_StartPoint(r.path)::geography
      )                                                       AS distance_to_start_m,
      -- Composite ranking score (0.0–1.0+ composite; not normalised to 1.0)
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
    -- Candidate destination buildings: fuzzy-match on name, above threshold
    JOIN (
      SELECT id, name, similarity(name, p_destination_text) AS sim
      FROM buildings
      WHERE campus_id  = p_campus_id
        AND deleted_at IS NULL
        AND similarity(name, p_destination_text) > 0.15
    ) mb ON mb.id = r.end_building_id
    -- Constrain to routes starting from the nearest building
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

-- Grant EXECUTE to authenticated role only (not anon).
-- The auth.uid() IS NULL check above is defense-in-depth.
REVOKE EXECUTE ON FUNCTION match_route(float, float, text, uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION match_route(float, float, text, uuid, int) TO authenticated;
