-- Migration: 20260309_023_waypoints_insert_ownership
-- UP: Add ownership check to waypoints_insert RLS policy.
--
-- Previously, any volunteer could insert waypoints into any draft or
-- pending_save route regardless of who recorded it. This enables
-- cross-user route corruption. The fix restricts volunteers to their
-- own routes while allowing admin/om_specialist to insert on any route
-- (for corrections and review edits).

SET search_path TO public, extensions;

DROP POLICY IF EXISTS waypoints_insert ON waypoints;

CREATE POLICY waypoints_insert ON waypoints FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.status IN ('pending_save', 'draft')
      AND (
        current_user_role() IN ('admin', 'om_specialist')
        OR (current_user_role() = 'volunteer' AND r.recorded_by = auth.uid())
      )
  )
);
