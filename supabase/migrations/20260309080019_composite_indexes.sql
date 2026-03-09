-- Migration: 20260309_019_composite_indexes
-- UP: Add composite indexes for the two most common query patterns.
--
-- 1. routes(campus_id, status) WHERE deleted_at IS NULL
--    Used by match_route RPC and syncEngine.ts. Both filter on campus_id
--    and status simultaneously. The partial index excludes soft-deleted
--    rows, matching every read path.
--
-- 2. waypoints(route_id, position)
--    Used by every ordered waypoint fetch (save_route, v_routes, v_waypoints,
--    navigation data loading). A composite index lets Postgres satisfy both
--    the equality filter on route_id and the ORDER BY position in a single
--    index scan, eliminating an in-memory sort.

SET search_path TO public, extensions;

CREATE INDEX CONCURRENTLY IF NOT EXISTS routes_campus_status_idx
  ON routes(campus_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS waypoints_route_position_idx
  ON waypoints(route_id, position);
