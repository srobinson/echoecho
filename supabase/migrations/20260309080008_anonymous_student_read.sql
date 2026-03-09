-- Migration: 20260309_008_anonymous_student_read
-- UP: Allow anonymous authenticated users (students without profiles) to read
-- published campus data. Anonymous sign-in gives auth.uid() but no profile row,
-- so current_user_role() returns NULL. These policies grant read access to any
-- authenticated user for published/public data. Write access remains restricted
-- to profiled users with appropriate roles.

-- ============================================================
-- CAMPUSES: any authenticated user can read active campuses
-- ============================================================

CREATE POLICY campuses_anon_read ON campuses FOR SELECT USING (
  deleted_at IS NULL
  AND auth.uid() IS NOT NULL
);

-- ============================================================
-- BUILDINGS: any authenticated user can read campus buildings
-- ============================================================

CREATE POLICY buildings_anon_read ON buildings FOR SELECT USING (
  deleted_at IS NULL
  AND auth.uid() IS NOT NULL
);

-- ============================================================
-- BUILDING ENTRANCES: any authenticated user can read
-- ============================================================

CREATE POLICY building_entrances_anon_read ON building_entrances FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM buildings b
    WHERE b.id = building_id AND b.deleted_at IS NULL
  )
);

-- ============================================================
-- ROUTES: any authenticated user can read published routes
-- ============================================================

CREATE POLICY routes_anon_read ON routes FOR SELECT USING (
  deleted_at IS NULL
  AND status = 'published'
  AND auth.uid() IS NOT NULL
);

-- ============================================================
-- WAYPOINTS: any authenticated user can read waypoints of published routes
-- ============================================================

CREATE POLICY waypoints_anon_read ON waypoints FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.deleted_at IS NULL
      AND r.status = 'published'
  )
);

-- ============================================================
-- HAZARDS: any authenticated user can read hazards
-- ============================================================

CREATE POLICY hazards_anon_read ON hazards FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);

-- ============================================================
-- POIS: any authenticated user can read POIs
-- ============================================================

CREATE POLICY pois_anon_read ON pois FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);
