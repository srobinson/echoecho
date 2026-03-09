-- DOWN migration for 20260309_010_camelcase_views
-- Drops the 5 views and removes columns added to buildings, campuses,
-- waypoints, and hazards tables.
--
-- Views must be dropped before columns they reference are removed.

SET search_path TO public, extensions;

-- ============================================================
-- DROP VIEWS (order does not matter; none depend on each other)
-- ============================================================

DROP VIEW IF EXISTS v_routes;
DROP VIEW IF EXISTS v_waypoints;
DROP VIEW IF EXISTS v_hazards;
DROP VIEW IF EXISTS v_buildings;
DROP VIEW IF EXISTS v_campuses;

-- ============================================================
-- REMOVE COLUMNS added in the up migration
-- ============================================================

ALTER TABLE buildings
  DROP COLUMN IF EXISTS short_name,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS description;

ALTER TABLE campuses
  DROP COLUMN IF EXISTS short_name,
  DROP COLUMN IF EXISTS default_zoom;

ALTER TABLE waypoints
  DROP COLUMN IF EXISTS type;

ALTER TABLE hazards
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by;
