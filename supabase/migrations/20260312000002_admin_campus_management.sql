CREATE OR REPLACE FUNCTION public.create_campus(
  p_name text,
  p_short_name text,
  p_latitude float8,
  p_longitude float8
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_campus_id uuid;
  v_bounds_offset constant float8 := 0.005;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Campus name is required';
  END IF;

  IF p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'Invalid latitude';
  END IF;

  IF p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Invalid longitude';
  END IF;

  INSERT INTO campuses (name, short_name, location, bounds)
  VALUES (
    trim(p_name),
    NULLIF(trim(COALESCE(p_short_name, p_name)), ''),
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
    ST_SetSRID(
      ST_MakePolygon(
        ST_GeomFromText(format(
          'LINESTRING(%s %s, %s %s, %s %s, %s %s, %s %s)',
          p_longitude - v_bounds_offset, p_latitude - v_bounds_offset,
          p_longitude + v_bounds_offset, p_latitude - v_bounds_offset,
          p_longitude + v_bounds_offset, p_latitude + v_bounds_offset,
          p_longitude - v_bounds_offset, p_latitude + v_bounds_offset,
          p_longitude - v_bounds_offset, p_latitude - v_bounds_offset
        ))
      ),
      4326
    )
  )
  RETURNING id INTO v_campus_id;

  RETURN v_campus_id;
END;
$$;

ALTER FUNCTION public.create_campus(text, text, float8, float8) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_campus(text, text, float8, float8) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_campus(
  p_campus_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_campus_id IS NULL THEN
    RAISE EXCEPTION 'Campus id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM campuses
    WHERE id = p_campus_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Campus not found';
  END IF;

  IF (SELECT count(*) FROM campuses WHERE deleted_at IS NULL) <= 1 THEN
    RAISE EXCEPTION 'At least one campus must remain configured';
  END IF;

  UPDATE campuses
  SET deleted_at = now()
  WHERE id = p_campus_id
    AND deleted_at IS NULL;
END;
$$;

ALTER FUNCTION public.soft_delete_campus(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.soft_delete_campus(uuid) TO authenticated;
