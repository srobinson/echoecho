-- Migration: 20260309_001_initial_schema
-- UP: Create EchoEcho core tables, indexes, helper functions, and profile trigger
-- Reversible via: supabase/migrations/down/20260309_001_initial_schema_down.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE campuses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  location    geometry(Point, 4326)   NOT NULL,
  bounds      geometry(Polygon, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX ON campuses USING GIST(location);
CREATE INDEX ON campuses USING GIST(bounds);


CREATE TABLE buildings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   uuid        NOT NULL REFERENCES campuses(id),
  name        text        NOT NULL,
  outline     geometry(Polygon, 4326)    NOT NULL,
  entrances   geometry(MultiPoint, 4326),
  floors      int         NOT NULL DEFAULT 1,
  hours       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX ON buildings(campus_id);
CREATE INDEX ON buildings USING GIST(outline);
CREATE INDEX ON buildings USING GIST(entrances);
CREATE INDEX ON buildings USING GIN(to_tsvector('english', name));
CREATE INDEX ON buildings USING GIN(name gin_trgm_ops);


CREATE TABLE routes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id         uuid        NOT NULL REFERENCES campuses(id),
  start_building_id uuid        REFERENCES buildings(id),
  end_building_id   uuid        REFERENCES buildings(id),
  name              text        NOT NULL,
  difficulty        text        NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  tags              text[]      NOT NULL DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'pending_save'
                                CHECK (status IN ('pending_save', 'draft', 'published', 'retracted')),
  -- Materialized LineString from ordered waypoints; populated on route save (ALP-953)
  path              geometry(LineString, 4326),
  total_distance_m  float,
  -- SHA-256 of ordered waypoints; used by student app for offline change detection (ALP-963)
  content_hash      text,
  recorded_by       uuid        NOT NULL REFERENCES auth.users(id),
  published_by      uuid        REFERENCES auth.users(id),
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX ON routes(campus_id);
CREATE INDEX ON routes(status);
CREATE INDEX ON routes(start_building_id);
CREATE INDEX ON routes(end_building_id);
CREATE INDEX ON routes USING GIST(path);


CREATE TABLE waypoints (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id             uuid        NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  -- Fractional ordering to avoid renumbering on mid-sequence inserts
  position             float       NOT NULL,
  recorded_at          timestamptz NOT NULL,
  geom                 geometry(Point, 4326) NOT NULL,
  heading              float       CHECK (heading >= 0 AND heading < 360),
  annotation_text      text,
  annotation_audio_url text,
  photo_url            text,
  hazard_type          text        CHECK (hazard_type IN ('step', 'door', 'crossing', 'surface', 'other')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, position)
);

CREATE INDEX ON waypoints(route_id);
CREATE INDEX ON waypoints USING GIST(geom);


-- Extends auth.users. One row per user; created by trigger on auth.users INSERT.
CREATE TABLE profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('admin', 'om_specialist', 'volunteer', 'student')),
  -- NULL means global access (admin only). Non-admin users are restricted to one campus.
  campus_id   uuid        REFERENCES campuses(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- UPDATED_AT MAINTENANCE
-- A single trigger function keeps updated_at current on any table that has it.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER campuses_updated_at  BEFORE UPDATE ON campuses  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER buildings_updated_at BEFORE UPDATE ON buildings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER routes_updated_at    BEFORE UPDATE ON routes    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- CONTENT HASH MAINTENANCE
-- Recompute routes.content_hash whenever waypoints change.
-- SHA-256 over ordered (position, ST_AsText(geom)) pairs.
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_route_content_hash(p_route_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT encode(
    sha256(
      string_agg(
        position::text || ',' || ST_AsText(geom),
        '|' ORDER BY position
      )::bytea
    ),
    'hex'
  )
  INTO v_hash
  FROM waypoints
  WHERE route_id = p_route_id;

  UPDATE routes SET content_hash = v_hash WHERE id = p_route_id;
END;
$$;

CREATE OR REPLACE FUNCTION waypoints_after_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_route_content_hash(OLD.route_id);
  ELSE
    PERFORM recompute_route_content_hash(NEW.route_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER waypoints_content_hash
  AFTER INSERT OR UPDATE OR DELETE ON waypoints
  FOR EACH ROW EXECUTE FUNCTION waypoints_after_change();


-- ============================================================
-- PROFILE AUTO-CREATE TRIGGER
-- Creates a placeholder profile when a new auth user is inserted.
-- Role defaults to 'volunteer'; ALP-971 invite flow sets it explicitly.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, 'volunteer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
