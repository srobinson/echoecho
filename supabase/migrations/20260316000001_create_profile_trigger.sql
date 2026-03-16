-- The handle_new_user() function exists but the trigger on auth.users was never
-- created (pg_dump cannot export triggers on the auth schema). Without it,
-- anonymous sign-ins create auth.users rows but no matching profile, which
-- breaks current_user_role() and all role-based RLS policies.

-- 1. Create the missing trigger
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for existing auth users that have no profile row.
INSERT INTO public.profiles (id, role)
SELECT au.id, 'volunteer'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
