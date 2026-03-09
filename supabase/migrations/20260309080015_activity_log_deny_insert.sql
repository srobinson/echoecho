-- Migration: 20260309_015_activity_log_deny_insert
-- UP: Add explicit deny-all INSERT policy on activity_log
-- Reversible via: supabase/migrations/down/20260309_015_activity_log_deny_insert_down.sql
--
-- The table relies on RLS default-deny for INSERT (no INSERT policy = denied).
-- This makes the restriction explicit so future migrations cannot accidentally
-- open write access. All writes go through SECURITY DEFINER functions.

CREATE POLICY activity_log_deny_insert ON activity_log
  FOR INSERT WITH CHECK (false);
