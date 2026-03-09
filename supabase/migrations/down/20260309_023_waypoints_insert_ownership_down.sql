-- DOWN migration for 20260309_023_waypoints_insert_ownership
-- WARNING: Restores the policy without ownership check. Any volunteer
-- can insert waypoints into any draft/pending_save route.

SET search_path TO public, extensions;

DROP POLICY IF EXISTS waypoints_insert ON waypoints;

CREATE POLICY waypoints_insert ON waypoints FOR INSERT WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  AND EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.status IN ('pending_save', 'draft')
  )
);
