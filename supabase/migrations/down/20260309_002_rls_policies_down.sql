-- DOWN: Reverse 20260309_002_rls_policies

DROP POLICY IF EXISTS profiles_insert             ON profiles;
DROP POLICY IF EXISTS profiles_update_admin       ON profiles;
DROP POLICY IF EXISTS profiles_update_self        ON profiles;
DROP POLICY IF EXISTS profiles_read               ON profiles;

DROP POLICY IF EXISTS waypoints_delete            ON waypoints;
DROP POLICY IF EXISTS waypoints_insert            ON waypoints;
DROP POLICY IF EXISTS waypoints_read              ON waypoints;

DROP POLICY IF EXISTS routes_delete               ON routes;
DROP POLICY IF EXISTS routes_update               ON routes;
DROP POLICY IF EXISTS routes_insert               ON routes;
DROP POLICY IF EXISTS routes_read                 ON routes;

DROP POLICY IF EXISTS buildings_delete            ON buildings;
DROP POLICY IF EXISTS buildings_update            ON buildings;
DROP POLICY IF EXISTS buildings_insert            ON buildings;
DROP POLICY IF EXISTS buildings_read              ON buildings;

DROP POLICY IF EXISTS campuses_delete             ON campuses;
DROP POLICY IF EXISTS campuses_update             ON campuses;
DROP POLICY IF EXISTS campuses_insert             ON campuses;
DROP POLICY IF EXISTS campuses_read               ON campuses;

ALTER TABLE profiles  DISABLE ROW LEVEL SECURITY;
ALTER TABLE waypoints DISABLE ROW LEVEL SECURITY;
ALTER TABLE routes    DISABLE ROW LEVEL SECURITY;
ALTER TABLE buildings DISABLE ROW LEVEL SECURITY;
ALTER TABLE campuses  DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS current_user_campus();
DROP FUNCTION IF EXISTS current_user_role();
