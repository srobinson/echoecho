-- DOWN migration for 20260309_016_routes_building_fk_on_delete
-- Restores the original FKs without ON DELETE action (default RESTRICT).

ALTER TABLE routes
  DROP CONSTRAINT routes_start_building_id_fkey,
  DROP CONSTRAINT routes_end_building_id_fkey;

ALTER TABLE routes
  ADD CONSTRAINT routes_start_building_id_fkey
    FOREIGN KEY (start_building_id) REFERENCES buildings(id),
  ADD CONSTRAINT routes_end_building_id_fkey
    FOREIGN KEY (end_building_id) REFERENCES buildings(id);
