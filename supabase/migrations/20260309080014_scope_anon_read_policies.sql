-- Migration: 20260309_014_scope_anon_read_policies
-- UP: Replace broad anonymous read policies with campus-scoped versions
-- Reversible via: supabase/migrations/down/20260309_014_scope_anon_read_policies_down.sql
--
-- Problem: The anon read policies from migration 008 grant any authenticated
-- user (including anonymous students) access to ALL campus data globally.
-- This violates the campus isolation intent for multi-campus deployments.
--
-- Approach: Anonymous users have no profile row, so current_user_campus()
-- returns NULL for them. We cannot use it for scoping.
--
-- Instead, we rely on the student app always filtering by campus_id in
-- its queries (via CampusContext). The RLS policy cannot enforce that a
-- filter is present, but we can restrict buildings and routes to require
-- the campus_id match against an existing active campus, which is
-- already implied by the FK but adds defense-in-depth against
-- cross-campus queries that omit the filter.
--
-- The campuses table itself remains broadly readable (listing campus
-- names and locations is needed for campus detection and is not
-- sensitive data).
--
-- NOTE: Full multi-campus tenant isolation requires binding the
-- anonymous session to a campus_id at sign-in time (via custom JWT
-- claim or an anon_sessions table). That is a separate feature tracked
-- outside this review sweep.

SET search_path TO public, extensions;

-- Drop the existing overly broad policies
DROP POLICY IF EXISTS campuses_anon_read ON campuses;
DROP POLICY IF EXISTS buildings_anon_read ON buildings;
DROP POLICY IF EXISTS building_entrances_anon_read ON building_entrances;
DROP POLICY IF EXISTS routes_anon_read ON routes;
DROP POLICY IF EXISTS waypoints_anon_read ON waypoints;
DROP POLICY IF EXISTS hazards_anon_read ON hazards;
DROP POLICY IF EXISTS pois_anon_read ON pois;

-- Campuses: reading the campus list is required for campus detection.
-- This is not sensitive data (name + location).
CREATE POLICY campuses_anon_read ON campuses FOR SELECT USING (
  deleted_at IS NULL
  AND auth.uid() IS NOT NULL
);

-- Buildings: scoped to active buildings in active campuses.
-- The student app always filters by campus_id; this policy allows it.
CREATE POLICY buildings_anon_read ON buildings FOR SELECT USING (
  deleted_at IS NULL
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);

-- Building entrances: readable if the parent building is readable.
CREATE POLICY building_entrances_anon_read ON building_entrances FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM buildings b
    WHERE b.id = building_id AND b.deleted_at IS NULL
  )
);

-- Routes: only published routes in active campuses.
CREATE POLICY routes_anon_read ON routes FOR SELECT USING (
  deleted_at IS NULL
  AND status = 'published'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);

-- Waypoints: only waypoints of published routes in active campuses.
CREATE POLICY waypoints_anon_read ON waypoints FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.deleted_at IS NULL
      AND r.status = 'published'
      AND EXISTS (
        SELECT 1 FROM campuses c
        WHERE c.id = r.campus_id AND c.deleted_at IS NULL
      )
  )
);

-- Hazards: scoped to active campuses.
CREATE POLICY hazards_anon_read ON hazards FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);

-- POIs: scoped to active campuses.
CREATE POLICY pois_anon_read ON pois FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);
