-- DOWN: Reverse 20260309_001_initial_schema
-- WARNING: Destructive. Drops all EchoEcho tables and supporting objects.
-- Run only against a development or staging database.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

DROP TRIGGER IF EXISTS waypoints_content_hash ON waypoints;
DROP FUNCTION IF EXISTS waypoints_after_change();
DROP FUNCTION IF EXISTS recompute_route_content_hash(uuid);

DROP TRIGGER IF EXISTS profiles_updated_at  ON profiles;
DROP TRIGGER IF EXISTS routes_updated_at    ON routes;
DROP TRIGGER IF EXISTS buildings_updated_at ON buildings;
DROP TRIGGER IF EXISTS campuses_updated_at  ON campuses;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS waypoints;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS buildings;
DROP TABLE IF EXISTS campuses;
