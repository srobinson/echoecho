-- DOWN migration for 20260309_007_missing_tables
-- Drops building_entrances, hazards, pois tables (reverse dependency order)
-- and the campuses.security_phone column added in this migration.
-- Policies, triggers, and indexes are dropped implicitly by CASCADE / DROP TABLE.

SET search_path TO public, extensions;

-- ============================================================
-- POIS: drop policies, trigger, indexes, table
-- ============================================================

DROP POLICY IF EXISTS pois_read ON pois;
DROP POLICY IF EXISTS pois_insert ON pois;
DROP POLICY IF EXISTS pois_update ON pois;
DROP POLICY IF EXISTS pois_delete ON pois;
DROP TRIGGER IF EXISTS pois_updated_at ON pois;
DROP TABLE IF EXISTS pois;

-- ============================================================
-- HAZARDS: drop policies, trigger, indexes, table
-- ============================================================

DROP POLICY IF EXISTS hazards_read ON hazards;
DROP POLICY IF EXISTS hazards_insert ON hazards;
DROP POLICY IF EXISTS hazards_update ON hazards;
DROP POLICY IF EXISTS hazards_delete ON hazards;
DROP TRIGGER IF EXISTS hazards_updated_at ON hazards;
DROP TABLE IF EXISTS hazards;

-- ============================================================
-- BUILDING ENTRANCES: drop policies, trigger, indexes, table
-- ============================================================

DROP POLICY IF EXISTS building_entrances_read ON building_entrances;
DROP POLICY IF EXISTS building_entrances_insert ON building_entrances;
DROP POLICY IF EXISTS building_entrances_update ON building_entrances;
DROP POLICY IF EXISTS building_entrances_delete ON building_entrances;
DROP TRIGGER IF EXISTS building_entrances_updated_at ON building_entrances;
DROP TABLE IF EXISTS building_entrances;

-- ============================================================
-- CAMPUSES: remove security_phone column
-- ============================================================

ALTER TABLE campuses DROP COLUMN IF EXISTS security_phone;
