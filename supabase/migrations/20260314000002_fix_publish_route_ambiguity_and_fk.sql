-- Fix two bugs introduced by the publish/retract flow.
--
-- Bug 1: publish_route("route_id" uuid) — the parameter name "route_id"
--   is ambiguous with the waypoints.route_id column inside the function body.
--   The DELETE...WHERE route_id = v_reverse_route_id statement fails on
--   republish (the only path where v_reverse_route_id IS NOT NULL).
--   Fix: rename parameter to p_route_id in both publish_route and retract_route.
--
-- Bug 2: routes_reverse_route_id_fkey has no ON DELETE action.
--   Deleting a route that another route points to via reverse_route_id fails
--   with a FK violation. Fix: change to ON DELETE SET NULL so the reverse
--   route's pointer is cleared instead of blocking deletion.

SET search_path TO public, extensions;

-- ──────────────────────────────────────────────────────────────────────────────
-- Bug 1: republish "column reference route_id is ambiguous"
-- ──────────────────────────────────────────────────────────────────────────────
-- PostgreSQL does not allow renaming a parameter via CREATE OR REPLACE.
-- Drop both functions first, then recreate with the p_ prefix.

DROP FUNCTION IF EXISTS "public"."publish_route"("uuid");
DROP FUNCTION IF EXISTS "public"."retract_route"("uuid");

CREATE OR REPLACE FUNCTION "public"."publish_route"("p_route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
  v_route public.routes%ROWTYPE;
  v_reverse_route_id uuid;
  v_source_route_id uuid := p_route_id;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT *
  INTO v_route
  FROM public.routes
  WHERE id = v_source_route_id
    AND status = 'draft'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_not_found_or_not_draft';
  END IF;

  UPDATE public.routes
  SET status       = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_at   = now()
  WHERE id = v_source_route_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_update_failed';
  END IF;

  IF v_route.start_building_id IS NOT NULL AND v_route.end_building_id IS NOT NULL THEN
    v_reverse_route_id := v_route.reverse_route_id;

    IF v_reverse_route_id IS NULL THEN
      INSERT INTO public.routes (
        campus_id,
        start_building_id,
        end_building_id,
        name,
        from_label,
        to_label,
        difficulty,
        tags,
        status,
        recorded_by,
        total_distance_m,
        path,
        recorded_duration_sec,
        recorded_at,
        description
      )
      VALUES (
        v_route.campus_id,
        v_route.end_building_id,
        v_route.start_building_id,
        v_route.name || ' (Reverse)',
        v_route.to_label,
        v_route.from_label,
        v_route.difficulty,
        v_route.tags,
        'draft',
        v_route.recorded_by,
        v_route.total_distance_m,
        ST_Reverse(v_route.path),
        v_route.recorded_duration_sec,
        v_route.recorded_at,
        v_route.description
      )
      RETURNING id INTO v_reverse_route_id;
    ELSE
      UPDATE public.routes
      SET campus_id              = v_route.campus_id,
          start_building_id     = v_route.end_building_id,
          end_building_id       = v_route.start_building_id,
          name                  = v_route.name || ' (Reverse)',
          from_label            = v_route.to_label,
          to_label              = v_route.from_label,
          difficulty             = v_route.difficulty,
          tags                  = v_route.tags,
          total_distance_m      = v_route.total_distance_m,
          path                  = ST_Reverse(v_route.path),
          recorded_duration_sec = v_route.recorded_duration_sec,
          recorded_at           = v_route.recorded_at,
          description           = v_route.description,
          status                = 'draft',
          deleted_at            = NULL,
          updated_at            = now()
      WHERE id = v_reverse_route_id;

      -- Qualify the column name explicitly to avoid any future ambiguity.
      DELETE FROM public.waypoints w
      WHERE w.route_id = v_reverse_route_id;
    END IF;

    INSERT INTO public.waypoints (
      route_id,
      position,
      recorded_at,
      geom,
      heading,
      annotation_text,
      annotation_audio_url,
      photo_url,
      hazard_type,
      type
    )
    SELECT
      v_reverse_route_id,
      row_number() OVER (ORDER BY w.position DESC),
      w.recorded_at,
      w.geom,
      w.heading,
      w.annotation_text,
      w.annotation_audio_url,
      w.photo_url,
      w.hazard_type,
      w.type
    FROM public.waypoints w
    WHERE w.route_id = v_source_route_id
    ORDER BY w.position DESC;

    PERFORM public.recompute_route_content_hash(v_reverse_route_id);

    UPDATE public.routes
    SET status           = 'published',
        published_by     = auth.uid(),
        published_at     = now(),
        updated_at       = now(),
        reverse_route_id = v_source_route_id
    WHERE id = v_reverse_route_id;

    UPDATE public.routes
    SET reverse_route_id = v_reverse_route_id
    WHERE id = v_source_route_id;
  END IF;

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.publish', 'route', v_source_route_id::text);
END;
$$;

ALTER FUNCTION "public"."publish_route"("p_route_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."publish_route"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_route"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_route"("p_route_id" "uuid") TO "service_role";


CREATE OR REPLACE FUNCTION "public"."retract_route"("p_route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
  v_reverse_route_id uuid;
  v_source_route_id uuid := p_route_id;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT reverse_route_id
  INTO v_reverse_route_id
  FROM public.routes
  WHERE id = v_source_route_id
    AND status = 'published'
    AND deleted_at IS NULL
  FOR UPDATE;

  UPDATE public.routes
  SET status     = 'retracted',
      updated_at = now()
  WHERE id = v_source_route_id
    AND status = 'published';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'route_not_found_or_not_published';
  END IF;

  IF v_reverse_route_id IS NOT NULL THEN
    UPDATE public.routes
    SET status     = 'retracted',
        updated_at = now()
    WHERE id = v_reverse_route_id
      AND status = 'published';
  END IF;

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.retract', 'route', v_source_route_id::text);
END;
$$;

ALTER FUNCTION "public"."retract_route"("p_route_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."retract_route"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."retract_route"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retract_route"("p_route_id" "uuid") TO "service_role";


-- ──────────────────────────────────────────────────────────────────────────────
-- Bug 2: delete blocked by self-referential FK with no ON DELETE action
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop the old FK constraint (no ON DELETE clause).
ALTER TABLE ONLY "public"."routes"
  DROP CONSTRAINT IF EXISTS "routes_reverse_route_id_fkey";

-- Re-add with ON DELETE SET NULL so deleting a route clears the pointer on
-- its paired reverse route rather than blocking the deletion.
ALTER TABLE ONLY "public"."routes"
  ADD CONSTRAINT "routes_reverse_route_id_fkey"
    FOREIGN KEY ("reverse_route_id")
    REFERENCES "public"."routes"("id")
    ON DELETE SET NULL;


-- ──────────────────────────────────────────────────────────────────────────────
-- delete_route: cascade-delete a route and its paired reverse (if any)
-- ──────────────────────────────────────────────────────────────────────────────
--
-- Works for both directions:
--   - User deletes the forward route: finds reverse_route_id, deletes reverse
--     first (ON DELETE SET NULL clears the forward's pointer), then deletes forward.
--   - User deletes the reverse route: same logic — the route being deleted
--     also carries a reverse_route_id pointing back to the forward, so it
--     finds and deletes the forward first, then deletes the requested route.
--
-- Waypoints cascade via waypoints_route_id_fkey ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION "public"."delete_route"("p_route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_reverse_route_id uuid;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Find the paired reverse route (present on both forward and reverse rows).
  SELECT reverse_route_id
  INTO v_reverse_route_id
  FROM public.routes
  WHERE id = p_route_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_not_found';
  END IF;

  -- Delete the paired route first. ON DELETE SET NULL on the FK automatically
  -- clears the requested route's reverse_route_id, preventing a FK conflict.
  IF v_reverse_route_id IS NOT NULL THEN
    DELETE FROM public.routes WHERE id = v_reverse_route_id;
  END IF;

  -- Delete the requested route. Waypoints are removed by ON DELETE CASCADE.
  DELETE FROM public.routes WHERE id = p_route_id;

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.delete', 'route', p_route_id::text);
END;
$$;

ALTER FUNCTION "public"."delete_route"("p_route_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."delete_route"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_route"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_route"("p_route_id" "uuid") TO "service_role";
