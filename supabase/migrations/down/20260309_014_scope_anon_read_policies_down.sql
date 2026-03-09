-- DOWN migration for 20260309_014_scope_anon_read_policies
-- Restores the original broad anonymous read policies from migration 008.

SET search_path TO public, extensions;

DROP POLICY IF EXISTS campuses_anon_read ON campuses;
DROP POLICY IF EXISTS buildings_anon_read ON buildings;
DROP POLICY IF EXISTS building_entrances_anon_read ON building_entrances;
DROP POLICY IF EXISTS routes_anon_read ON routes;
DROP POLICY IF EXISTS waypoints_anon_read ON waypoints;
DROP POLICY IF EXISTS hazards_anon_read ON hazards;
DROP POLICY IF EXISTS pois_anon_read ON pois;

CREATE POLICY campuses_anon_read ON campuses FOR SELECT USING (
  deleted_at IS NULL AND auth.uid() IS NOT NULL
);

CREATE POLICY buildings_anon_read ON buildings FOR SELECT USING (
  deleted_at IS NULL AND auth.uid() IS NOT NULL
);

CREATE POLICY building_entrances_anon_read ON building_entrances FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM buildings b
    WHERE b.id = building_id AND b.deleted_at IS NULL
  )
);

CREATE POLICY routes_anon_read ON routes FOR SELECT USING (
  deleted_at IS NULL
  AND status = 'published'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY waypoints_anon_read ON waypoints FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id
      AND r.deleted_at IS NULL
      AND r.status = 'published'
  )
);

CREATE POLICY hazards_anon_read ON hazards FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);

CREATE POLICY pois_anon_read ON pois FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id AND c.deleted_at IS NULL
  )
);
