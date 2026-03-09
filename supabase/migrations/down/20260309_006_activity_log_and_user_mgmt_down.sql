-- Migration: 20260309_006_activity_log_and_user_mgmt
-- DOWN: Remove activity log, revert profiles RLS, revert publish/retract RPCs

-- Revert publish_route and retract_route to non-logging versions from migration 004
CREATE OR REPLACE FUNCTION publish_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE routes SET
    status       = 'published',
    published_by = auth.uid(),
    published_at = now(),
    updated_at   = now()
  WHERE id = route_id AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_draft';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION retract_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE routes SET
    status     = 'retracted',
    updated_at = now()
  WHERE id = route_id AND status = 'published';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_published';
  END IF;
END;
$$;

-- Revert profiles_read to admin/self only
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles FOR SELECT USING (
  id = auth.uid()
  OR current_user_role() = 'admin'
);

DROP INDEX IF EXISTS profiles_campus_id_idx;

DROP TABLE IF EXISTS activity_log;
