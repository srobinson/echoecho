-- Migration: 20260309_007_missing_tables
-- UP: Add building_entrances, hazards, pois tables and campuses.security_phone
--
-- The initial schema (migration 001) stored building entrances as a single
-- geometry(MultiPoint) column on buildings. The app code (useAdminMapData,
-- CampusContext) expects a separate building_entrances table with per-entrance
-- metadata (name, accessibility notes, main entrance flag). This migration
-- adds the normalized table and the other missing structures.
--
-- Tables added:
--   building_entrances  - per-entrance records with accessibility metadata
--   hazards             - campus-wide hazard overlays (ALP-970)
--   pois                - points of interest including security offices (ALP-962)
--
-- Columns added:
--   campuses.security_phone - campus security phone number for emergency mode

SET search_path TO public, extensions;

-- ============================================================
-- CAMPUSES: add security_phone for emergency mode (ALP-962)
-- ============================================================

ALTER TABLE campuses
  ADD COLUMN IF NOT EXISTS security_phone text;

-- ============================================================
-- BUILDING ENTRANCES
-- Normalized entrance records. The buildings.entrances geometry column
-- from migration 001 is retained for spatial queries; this table adds
-- the per-entrance metadata the app needs.
-- ============================================================

CREATE TABLE IF NOT EXISTS building_entrances (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id          uuid        NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  coordinate           jsonb       NOT NULL,
  is_main              boolean     NOT NULL DEFAULT false,
  accessibility_notes  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON building_entrances(building_id);

ALTER TABLE building_entrances ENABLE ROW LEVEL SECURITY;

CREATE POLICY building_entrances_read ON building_entrances FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM buildings b
    WHERE b.id = building_id
      AND b.deleted_at IS NULL
      AND (
        current_user_role() IN ('admin', 'om_specialist', 'volunteer')
        OR (current_user_role() = 'student' AND b.campus_id = current_user_campus())
      )
  )
);

CREATE POLICY building_entrances_insert ON building_entrances FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY building_entrances_update ON building_entrances FOR UPDATE USING (
  current_user_role() = 'admin'
) WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY building_entrances_delete ON building_entrances FOR DELETE USING (
  current_user_role() = 'admin'
);

CREATE TRIGGER building_entrances_updated_at
  BEFORE UPDATE ON building_entrances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- HAZARDS
-- Campus-wide hazard overlays. Can be linked to a route, a waypoint,
-- or stand alone as a campus-level hazard.
-- ============================================================

CREATE TABLE IF NOT EXISTS hazards (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id     uuid        NOT NULL REFERENCES campuses(id),
  route_id      uuid        REFERENCES routes(id) ON DELETE SET NULL,
  waypoint_id   uuid        REFERENCES waypoints(id) ON DELETE SET NULL,
  type          text        NOT NULL CHECK (type IN (
    'uneven_surface', 'construction', 'stairs_unmarked',
    'low_clearance', 'seasonal', 'wet_surface', 'other'
  )),
  severity      text        NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  coordinate    jsonb       NOT NULL,
  title         text        NOT NULL,
  description   text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON hazards(campus_id);
CREATE INDEX ON hazards(route_id);

ALTER TABLE hazards ENABLE ROW LEVEL SECURITY;

CREATE POLICY hazards_read ON hazards FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id
      AND c.deleted_at IS NULL
      AND (
        current_user_role() IN ('admin', 'om_specialist', 'volunteer')
        OR (current_user_role() = 'student' AND c.id = current_user_campus())
      )
  )
);

CREATE POLICY hazards_insert ON hazards FOR INSERT WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist')
);

CREATE POLICY hazards_update ON hazards FOR UPDATE USING (
  current_user_role() IN ('admin', 'om_specialist')
) WITH CHECK (
  current_user_role() IN ('admin', 'om_specialist')
);

CREATE POLICY hazards_delete ON hazards FOR DELETE USING (
  current_user_role() IN ('admin', 'om_specialist')
);

CREATE TRIGGER hazards_updated_at
  BEFORE UPDATE ON hazards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- POIS (Points of Interest)
-- Used by student emergency mode to locate security offices
-- and other campus landmarks.
-- ============================================================

CREATE TABLE IF NOT EXISTS pois (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   uuid        NOT NULL REFERENCES campuses(id),
  name        text        NOT NULL,
  category    text        NOT NULL CHECK (category IN (
    'security', 'restroom', 'water_fountain', 'elevator',
    'emergency_phone', 'parking', 'transit', 'other'
  )),
  coordinate  jsonb       NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pois(campus_id);
CREATE INDEX ON pois(category);

ALTER TABLE pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY pois_read ON pois FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM campuses c
    WHERE c.id = campus_id
      AND c.deleted_at IS NULL
      AND (
        current_user_role() IN ('admin', 'om_specialist', 'volunteer')
        OR (current_user_role() = 'student' AND c.id = current_user_campus())
      )
  )
);

CREATE POLICY pois_insert ON pois FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY pois_update ON pois FOR UPDATE USING (
  current_user_role() = 'admin'
) WITH CHECK (
  current_user_role() = 'admin'
);

CREATE POLICY pois_delete ON pois FOR DELETE USING (
  current_user_role() = 'admin'
);

CREATE TRIGGER pois_updated_at
  BEFORE UPDATE ON pois
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
