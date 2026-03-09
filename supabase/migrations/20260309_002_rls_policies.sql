-- Migration: 20260309_002_rls_policies
-- UP: Enable RLS and define row-level security policies for all EchoEcho tables
-- Reversible via: supabase/migrations/down/20260309_002_rls_policies_down.sql

-- ============================================================
-- HELPER FUNCTIONS
-- SECURITY DEFINER so they run as the function owner, not the calling user.
-- STABLE means Postgres can cache the result within a single statement.
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION current_user_campus()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT campus_id FROM profiles WHERE id = auth.uid() AND is_active = true
$$;


-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE campuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- CAMPUSES
-- Admin: CRUD. All others: read-only (students scoped to own campus).
-- ============================================================

CREATE POLICY campuses_read ON campuses FOR SELECT USING (
  deleted_at IS NULL
  AND (
    current_user_role() IN ('admin', 'om_specialist', 'volunteer')
    OR (current_user_role() = 'student' AND id = current_user_campus())
  )
);

CREATE POLICY campuses_insert ON campuses FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY campuses_update ON campuses FOR UPDATE USING (
  current_user_role() = 'admin'
) WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY campuses_delete ON campuses FOR DELETE USING (
  current_user_role() = 'admin'
);


-- ============================================================
-- BUILDINGS
-- Admin: CRUD. Others: read-only (students scoped to own campus buildings).
-- ============================================================

CREATE POLICY buildings_read ON buildings FOR SELECT USING (
  deleted_at IS NULL
  AND (
    current_user_role() IN ('admin', 'om_specialist', 'volunteer')
    OR (current_user_role() = 'student' AND campus_id = current_user_campus())
  )
);

CREATE POLICY buildings_insert ON buildings FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY buildings_update ON buildings FOR UPDATE USING (
  current_user_role() = 'admin'
) WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY buildings_delete ON buildings FOR DELETE USING (
  current_user_role() = 'admin'
);


-- ============================================================
-- ROUTES
-- Read: admin/om_specialist/volunteer see all; students see published routes on own campus.
-- Insert: admin + om_specialist any status; volunteer restricted to pending_save.
-- Update: admin + om_specialist only (includes publish action).
-- Delete: admin only (soft-delete via deleted_at, not physical DELETE).
-- ============================================================

CREATE POLICY routes_read ON routes FOR SELECT USING (
  deleted_at IS NULL
  AND (
    current_user_role() IN ('admin', 'om_specialist', 'volunteer')
    OR (
      current_user_role() = 'student'
      AND status = 'published'
      AND campus_id = current_user_campus()
    )
  )
);

CREATE POLICY routes_insert ON routes FOR INSERT WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  AND (current_user_role() != 'volunteer' OR status = 'pending_save')
);

CREATE POLICY routes_update ON routes FOR UPDATE USING (
  current_user_role() IN ('admin', 'om_specialist')
) WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist')
);

CREATE POLICY routes_delete ON routes FOR DELETE USING (
  current_user_role() = 'admin'
);


-- ============================================================
-- WAYPOINTS
-- Read mirrors route read. Insert is for active recorders on non-published routes.
-- No update policy: waypoints are append-only; edits go through delete+reinsert (ALP-967).
-- ============================================================

CREATE POLICY waypoints_read ON waypoints FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.deleted_at IS NULL
      AND (
        current_user_role() IN ('admin', 'om_specialist', 'volunteer')
        OR (
          current_user_role() = 'student'
          AND r.status = 'published'
          AND r.campus_id = current_user_campus()
        )
      )
  )
);

CREATE POLICY waypoints_insert ON waypoints FOR INSERT WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  AND EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.status IN ('pending_save', 'draft')
  )
);

CREATE POLICY waypoints_delete ON waypoints FOR DELETE USING (
  current_user_role() IN ('admin', 'om_specialist')
);


-- ============================================================
-- PROFILES
-- Users see their own row. Admin sees all rows. Admin can update any row.
-- Users can update their own non-sensitive fields (campus_id, etc.).
-- ============================================================

CREATE POLICY profiles_read ON profiles FOR SELECT USING (
  id = auth.uid()
  OR current_user_role() = 'admin'
);

CREATE POLICY profiles_update_self ON profiles FOR UPDATE USING (
  id = auth.uid()
) WITH CHECK (
  -- Users cannot elevate their own role or set is_active
  id = auth.uid()
  AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
);

CREATE POLICY profiles_update_admin ON profiles FOR UPDATE USING (
  current_user_role() = 'admin'
) WITH CHECK (
  current_user_role() = 'admin'
);

-- Admin can insert profiles for invited users (ALP-971)
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
  OR id = auth.uid()
);
