-- DOWN migration for 20260309_008_anonymous_student_read
-- Drops the 7 anonymous read policies added across campuses, buildings,
-- building_entrances, routes, waypoints, hazards, and pois.
-- After rollback, only profiled users with explicit roles can read data.

SET search_path TO public, extensions;

DROP POLICY IF EXISTS campuses_anon_read ON campuses;
DROP POLICY IF EXISTS buildings_anon_read ON buildings;
DROP POLICY IF EXISTS building_entrances_anon_read ON building_entrances;
DROP POLICY IF EXISTS routes_anon_read ON routes;
DROP POLICY IF EXISTS waypoints_anon_read ON waypoints;
DROP POLICY IF EXISTS hazards_anon_read ON hazards;
DROP POLICY IF EXISTS pois_anon_read ON pois;
