DROP INDEX IF EXISTS public.routes_reverse_route_id_unique;

ALTER TABLE public.routes
DROP CONSTRAINT IF EXISTS routes_reverse_route_id_fkey;

ALTER TABLE public.routes
DROP COLUMN IF EXISTS reverse_route_id;

CREATE OR REPLACE FUNCTION public.publish_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.routes SET
    status       = 'published',
    published_by = auth.uid(),
    published_at = now(),
    updated_at   = now()
  WHERE id = route_id AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_draft';
  END IF;

  INSERT INTO public.activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.publish', 'route', route_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.retract_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.routes SET
    status     = 'retracted',
    updated_at = now()
  WHERE id = route_id AND status = 'published';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_published';
  END IF;

  INSERT INTO public.activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.retract', 'route', route_id::text);
END;
$$;
