REVOKE EXECUTE ON FUNCTION public.soft_delete_campus(uuid) FROM authenticated;
DROP FUNCTION IF EXISTS public.soft_delete_campus(uuid);

REVOKE EXECUTE ON FUNCTION public.create_campus(text, text, float8, float8) FROM authenticated;
DROP FUNCTION IF EXISTS public.create_campus(text, text, float8, float8);
