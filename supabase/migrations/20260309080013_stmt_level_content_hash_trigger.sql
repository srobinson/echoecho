-- Migration: 20260309_013_stmt_level_content_hash_trigger
-- UP: Convert waypoints_content_hash from FOR EACH ROW to FOR EACH STATEMENT
-- Reversible via: supabase/migrations/down/20260309_013_stmt_level_content_hash_trigger_down.sql
--
-- Problem: The per-row trigger fires recompute_route_content_hash once per
-- inserted waypoint. A 900-waypoint route save produces 900 hash recomputes,
-- each scanning the full waypoints set for that route: O(N^2) total work.
--
-- Fix: Use statement-level triggers with transition tables (REFERENCING NEW/OLD
-- TABLE AS). Postgres requires separate triggers for INSERT/UPDATE vs DELETE
-- because a single trigger cannot reference both NEW TABLE and OLD TABLE across
-- all three operations.

SET search_path TO public, extensions;

-- Drop the old per-row trigger and its function
DROP TRIGGER IF EXISTS waypoints_content_hash ON waypoints;
DROP FUNCTION IF EXISTS waypoints_after_change();

-- Statement-level function for INSERT and UPDATE: reads from transition table 'inserted'
CREATE OR REPLACE FUNCTION waypoints_after_insert_update_stmt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recompute_route_content_hash(route_id)
  FROM (SELECT DISTINCT route_id FROM inserted) AS changed;
  RETURN NULL;
END;
$$;

-- Statement-level function for DELETE: reads from transition table 'deleted'
CREATE OR REPLACE FUNCTION waypoints_after_delete_stmt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recompute_route_content_hash(route_id)
  FROM (SELECT DISTINCT route_id FROM deleted) AS changed;
  RETURN NULL;
END;
$$;

-- Trigger for INSERT and UPDATE
CREATE TRIGGER waypoints_content_hash_insert_update
  AFTER INSERT OR UPDATE ON waypoints
  REFERENCING NEW TABLE AS inserted
  FOR EACH STATEMENT EXECUTE FUNCTION waypoints_after_insert_update_stmt();

-- Trigger for DELETE
CREATE TRIGGER waypoints_content_hash_delete
  AFTER DELETE ON waypoints
  REFERENCING OLD TABLE AS deleted
  FOR EACH STATEMENT EXECUTE FUNCTION waypoints_after_delete_stmt();
