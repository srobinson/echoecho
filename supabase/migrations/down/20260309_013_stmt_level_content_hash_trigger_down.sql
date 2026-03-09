-- DOWN migration for 20260309_013_stmt_level_content_hash_trigger
-- Restores the original per-row trigger on waypoints.

SET search_path TO public, extensions;

-- Drop statement-level triggers and their functions
DROP TRIGGER IF EXISTS waypoints_content_hash_insert_update ON waypoints;
DROP TRIGGER IF EXISTS waypoints_content_hash_delete ON waypoints;
DROP FUNCTION IF EXISTS waypoints_after_insert_update_stmt();
DROP FUNCTION IF EXISTS waypoints_after_delete_stmt();

-- Restore original per-row function and trigger
CREATE OR REPLACE FUNCTION waypoints_after_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_route_content_hash(OLD.route_id);
  ELSE
    PERFORM recompute_route_content_hash(NEW.route_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER waypoints_content_hash
  AFTER INSERT OR UPDATE OR DELETE ON waypoints
  FOR EACH ROW EXECUTE FUNCTION waypoints_after_change();
