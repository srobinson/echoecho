-- Migration: 20260309_011_fix_content_hash_null
-- UP: Fix recompute_route_content_hash to produce deterministic hash for empty waypoint sets
-- Reversible via: supabase/migrations/down/20260309_011_fix_content_hash_null_down.sql
--
-- Problem: When all waypoints are deleted from a route, string_agg returns NULL,
-- which propagates through sha256(NULL::bytea) to set content_hash = NULL.
-- This causes the sync engine to re-fetch the route on every cycle (NULL never
-- matches a local hash string) and the student app to receive an empty waypoint
-- array, which breaks navigation.
--
-- Fix: COALESCE the NULL case to sha256(''::bytea), producing a stable sentinel
-- hash for zero-waypoint routes. Also add a CHECK constraint preventing published
-- routes from having a NULL content_hash.

SET search_path TO public, extensions;

-- Replace the function with NULL-safe version
CREATE OR REPLACE FUNCTION recompute_route_content_hash(p_route_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT COALESCE(
    encode(
      sha256(
        string_agg(
          position::text || ',' || ST_AsText(geom),
          '|' ORDER BY position
        )::bytea
      ),
      'hex'
    ),
    encode(sha256(''::bytea), 'hex')  -- deterministic empty-route sentinel
  )
  INTO v_hash
  FROM waypoints
  WHERE route_id = p_route_id;

  UPDATE routes SET content_hash = v_hash WHERE id = p_route_id;
END;
$$;

-- Fix any existing NULL content_hash values before adding the constraint
UPDATE routes
SET content_hash = encode(sha256(''::bytea), 'hex')
WHERE content_hash IS NULL;

-- Published routes must always have a content_hash.
-- This prevents publishing a route that somehow has no waypoints.
ALTER TABLE routes
  ADD CONSTRAINT routes_published_requires_hash
  CHECK (status != 'published' OR content_hash IS NOT NULL);
