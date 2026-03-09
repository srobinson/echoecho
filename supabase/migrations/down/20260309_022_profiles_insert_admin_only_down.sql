-- DOWN migration for 20260309_022_profiles_insert_admin_only
-- WARNING: This restores a privilege escalation vulnerability. The
-- OR id = auth.uid() clause allows any user to self-insert a profile
-- with an arbitrary role. Only roll back if you have another mitigation.

SET search_path TO public, extensions;

DROP POLICY IF EXISTS profiles_insert ON profiles;

CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  current_user_role() = 'admin'
  OR id = auth.uid()
);
