ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS reverse_route_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'routes_reverse_route_id_fkey'
  ) THEN
    ALTER TABLE public.routes
    ADD CONSTRAINT routes_reverse_route_id_fkey
    FOREIGN KEY (reverse_route_id) REFERENCES public.routes(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS routes_reverse_route_id_unique
ON public.routes (reverse_route_id)
WHERE reverse_route_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.publish_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_route public.routes%ROWTYPE;
  v_reverse_route_id uuid;
  v_source_route_id uuid := route_id;
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
    RAISE EXCEPTION 'route_not_found_or_not_draft';
  END IF;

  IF v_route.start_building_id IS NOT NULL AND v_route.end_building_id IS NOT NULL THEN
    v_reverse_route_id := v_route.reverse_route_id;

    IF v_reverse_route_id IS NULL THEN
      INSERT INTO public.routes (
        campus_id,
        start_building_id,
        end_building_id,
        name,
        difficulty,
        tags,
        status,
        path,
        total_distance_m,
        recorded_by,
        from_label,
        to_label,
        recorded_duration_sec,
        recorded_at,
        description
      ) VALUES (
        v_route.campus_id,
        v_route.end_building_id,
        v_route.start_building_id,
        v_route.name || ' (Reverse)',
        v_route.difficulty,
        v_route.tags,
        'draft',
        CASE WHEN v_route.path IS NOT NULL THEN extensions.ST_Reverse(v_route.path) ELSE NULL END,
        v_route.total_distance_m,
        v_route.recorded_by,
        v_route.to_label,
        v_route.from_label,
        v_route.recorded_duration_sec,
        v_route.recorded_at,
        v_route.description
      )
      RETURNING id INTO v_reverse_route_id;
    ELSE
      UPDATE public.routes
      SET campus_id              = v_route.campus_id,
          start_building_id      = v_route.end_building_id,
          end_building_id        = v_route.start_building_id,
          name                   = v_route.name || ' (Reverse)',
          difficulty             = v_route.difficulty,
          tags                   = v_route.tags,
          path                   = CASE WHEN v_route.path IS NOT NULL THEN extensions.ST_Reverse(v_route.path) ELSE NULL END,
          total_distance_m       = v_route.total_distance_m,
          recorded_by            = v_route.recorded_by,
          from_label             = v_route.to_label,
          to_label               = v_route.from_label,
          recorded_duration_sec  = v_route.recorded_duration_sec,
          recorded_at            = v_route.recorded_at,
          description            = v_route.description,
          status                 = 'draft',
          deleted_at             = NULL,
          updated_at             = now()
      WHERE id = v_reverse_route_id;

      DELETE FROM public.waypoints
      WHERE route_id = v_reverse_route_id;
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
    SET status          = 'published',
        published_by    = auth.uid(),
        published_at    = now(),
        updated_at      = now(),
        reverse_route_id = v_source_route_id
    WHERE id = v_reverse_route_id;

    UPDATE public.routes
    SET reverse_route_id = v_reverse_route_id
    WHERE id = v_source_route_id;
  END IF;

  INSERT INTO public.activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.publish', 'route', v_source_route_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.retract_route(route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_reverse_route_id uuid;
  v_source_route_id uuid := route_id;
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

  INSERT INTO public.activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.retract', 'route', v_source_route_id::text);
END;
$$;
