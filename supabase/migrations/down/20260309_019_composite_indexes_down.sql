-- DOWN migration for 20260309_019_composite_indexes
-- Drops the composite indexes. The original single-column indexes from
-- migration 001 remain intact.

DROP INDEX IF EXISTS routes_campus_status_idx;
DROP INDEX IF EXISTS waypoints_route_position_idx;
