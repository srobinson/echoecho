-- Staging seed data for device verification (ALP-1000 through ALP-1003)
--
-- Run via:
--   just supabase-seed-staging
--
-- Or manually:
--   psql $STAGING_DB_URL -f supabase/seed_staging.sql
--
-- This script now removes the retired deterministic TSBVI verification seed.
-- It no longer re-inserts that campus or its related records.

SET search_path TO public, extensions;

-- ============================================================
-- CLEANUP: delete retired deterministic TSBVI seed data
-- ============================================================

DELETE FROM hazards    WHERE id IN ('00000000-0000-0000-0000-000000000300');
DELETE FROM waypoints  WHERE route_id IN ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000200');
DELETE FROM routes     WHERE id IN ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000200');
DELETE FROM pois       WHERE id IN ('00000000-0000-0000-0000-000000000030');
DELETE FROM building_entrances WHERE id IN ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023');
DELETE FROM buildings  WHERE id IN ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');
DELETE FROM campuses   WHERE id IN ('00000000-0000-0000-0000-000000000001');
