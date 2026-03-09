-- Migration: 20260309_006_activity_log_and_user_mgmt
-- UP: Activity log table, updated profiles RLS, route event logging
-- Reversible via: supabase/migrations/down/20260309_006_activity_log_and_user_mgmt_down.sql

-- ============================================================
-- ACTIVITY LOG
-- Append-only audit table. All writes go through SECURITY DEFINER
-- functions or Edge Functions using the service role key.
-- Reads: admin sees all; all other roles see nothing (admin panel only).
-- ============================================================

CREATE TABLE activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES auth.users(id),
  action      text        NOT NULL,
  target_type text        NOT NULL CHECK (target_type IN ('user', 'route', 'campus')),
  target_id   text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON activity_log(actor_id);
CREATE INDEX ON activity_log(target_id);
CREATE INDEX ON activity_log(created_at DESC);

-- Supported event taxonomy (enforced by Edge Functions and Postgres RPCs):
--   user.invite       admin invited a user
--   user.deactivate   admin deactivated a user
--   user.role_change  admin changed a user's role
--   auth.login        user logged in (via Auth webhook)
--   route.publish     route published
--   route.retract     route retracted

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Admin reads all activity. No write policy — all inserts bypass RLS via
-- SECURITY DEFINER functions or the service role key.
CREATE POLICY activity_log_read_admin ON activity_log FOR SELECT USING (
  current_user_role() = 'admin'
);

-- ============================================================
-- PROFILES: add campus_id index for RLS performance
-- current_user_campus() is called on every profile query by om_specialists.
-- Without this index the RLS check degrades to a full seq scan on profiles.
-- ============================================================

CREATE INDEX IF NOT EXISTS profiles_campus_id_idx ON profiles(campus_id);

-- ============================================================
-- PROFILES RLS: extend read access to om_specialist (own campus only)
-- The existing policy only allowed self or admin.
-- om_specialists need to see users on their campus for the user list screen.
-- ============================================================

DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles FOR SELECT USING (
  id = auth.uid()
  OR current_user_role() = 'admin'
  OR (
    current_user_role() = 'om_specialist'
    AND campus_id = current_user_campus()
  )
);

-- ============================================================
-- PUBLISH / RETRACT ROUTE: add activity logging
-- Replaces the functions from migration 004 to add audit trail.
-- ============================================================

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

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.publish', 'route', route_id::text);
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

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.retract', 'route', route_id::text);
END;
$$;
