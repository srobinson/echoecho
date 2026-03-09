-- Migration: 20260309_022_profiles_insert_admin_only
-- UP: Remove self-insert clause from profiles_insert RLS policy.
--
-- The previous policy allowed any authenticated user to insert their own
-- profile row with an arbitrary role (including 'admin'), enabling
-- privilege escalation. The handle_new_user() SECURITY DEFINER trigger
-- creates profile rows for new users; no legitimate client INSERT path
-- should exist. The invite-user edge function uses the service role key
-- (bypasses RLS) and is unaffected.

SET search_path TO public, extensions;

DROP POLICY IF EXISTS profiles_insert ON profiles;

CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
);
