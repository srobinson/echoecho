-- DOWN migration for 20260309_011_fix_content_hash_null
-- Reverts to the original recompute_route_content_hash (without COALESCE)
-- and drops the published-requires-hash constraint.

SET search_path TO public, extensions;

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_published_requires_hash;

-- Restore original function (NULL when no waypoints)
CREATE OR REPLACE FUNCTION recompute_route_content_hash(p_route_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT encode(
    sha256(
      string_agg(
        position::text || ',' || ST_AsText(geom),
        '|' ORDER BY position
      )::bytea
    ),
    'hex'
  )
  INTO v_hash
  FROM waypoints
  WHERE route_id = p_route_id;

  UPDATE routes SET content_hash = v_hash WHERE id = p_route_id;
END;
$$;
