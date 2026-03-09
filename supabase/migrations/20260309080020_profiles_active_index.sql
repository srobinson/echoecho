-- Migration: 20260309_020_profiles_active_index
-- UP: Add partial index on profiles(id) WHERE is_active = true.
--
-- current_user_role() and current_user_campus() query
-- profiles WHERE id = auth.uid() AND is_active = true on every RLS
-- evaluation. The primary key resolves the id lookup, but the is_active
-- predicate requires a heap fetch to confirm. This partial index lets
-- Postgres resolve both conditions at index scan time and skip inactive
-- profiles without touching the heap.

SET search_path TO public, extensions;

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_id_active_idx
  ON profiles(id)
  WHERE is_active = true;
