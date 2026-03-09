-- Migration: 20260309_016_routes_building_fk_on_delete
-- UP: Add ON DELETE SET NULL to routes.start_building_id and end_building_id FKs
-- Reversible via: supabase/migrations/down/20260309_016_routes_building_fk_on_delete_down.sql
--
-- Both columns are nullable, so SET NULL is the correct action when a building
-- is physically deleted. Without this, any DELETE on a referenced building
-- fails with a FK violation, even during test data cleanup.

ALTER TABLE routes
  DROP CONSTRAINT routes_start_building_id_fkey,
  DROP CONSTRAINT routes_end_building_id_fkey;

ALTER TABLE routes
  ADD CONSTRAINT routes_start_building_id_fkey
    FOREIGN KEY (start_building_id) REFERENCES buildings(id) ON DELETE SET NULL,
  ADD CONSTRAINT routes_end_building_id_fkey
    FOREIGN KEY (end_building_id) REFERENCES buildings(id) ON DELETE SET NULL;
