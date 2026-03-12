-- Migration: baseline
-- Single clean baseline replacing all prior incremental migrations.
-- Generated from live remote schema dump on 2026-03-10.
-- Includes: full schema, corrected profiles_insert policy (admin-only),
--           reverse-route publish/retract support,
--           and campus boundary management RPCs.

SET search_path TO public, extensions;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."create_building_stub"("p_campus_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_building_id uuid;
  -- ~10 metres in degrees at mid-latitudes (~0.00009°)
  v_delta       float := 0.00009;
  v_outline     geometry;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist', 'volunteer')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_outline := ST_SetSRID(
    ST_MakePolygon(
      ST_GeomFromText(format(
        'LINESTRING(%s %s, %s %s, %s %s, %s %s, %s %s)',
        p_lng - v_delta, p_lat - v_delta,
        p_lng + v_delta, p_lat - v_delta,
        p_lng + v_delta, p_lat + v_delta,
        p_lng - v_delta, p_lat + v_delta,
        p_lng - v_delta, p_lat - v_delta
      ))
    ),
    4326
  );

  INSERT INTO buildings (campus_id, name, outline)
  VALUES (p_campus_id, p_name, v_outline)
  RETURNING id INTO v_building_id;

  RETURN v_building_id;
END;
$$;


ALTER FUNCTION "public"."create_building_stub"("p_campus_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_campus"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT campus_id FROM profiles WHERE id = auth.uid() AND is_active = true
$$;


ALTER FUNCTION "public"."current_user_campus"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, 'volunteer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_user_point           geography;
  v_nearest_building_id  uuid;
  v_nearest_building_name text;
  v_unmatched_destination boolean;
  v_matches              jsonb;
  v_campus_exists        boolean;
BEGIN
  -- Auth guard: reject unauthenticated requests.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;

  -- Clamp p_limit to a safe range
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    p_limit := 3;
  END IF;

  -- Validate campus exists.
  SELECT EXISTS(
    SELECT 1 FROM campuses WHERE id = p_campus_id AND deleted_at IS NULL
  ) INTO v_campus_exists;

  IF NOT v_campus_exists THEN
    RAISE EXCEPTION 'campus_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate coordinates are within valid WGS-84 bounds.
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'invalid_position' USING ERRCODE = 'P0003';
  END IF;

  v_user_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  SELECT b.id, b.name
  INTO v_nearest_building_id, v_nearest_building_name
  FROM buildings b
  WHERE b.campus_id = p_campus_id AND b.deleted_at IS NULL
  ORDER BY ST_Distance(v_user_point, b.outline::geography)
  LIMIT 1;

  SELECT NOT EXISTS (
    SELECT 1 FROM buildings
    WHERE campus_id  = p_campus_id
      AND deleted_at IS NULL
      AND similarity(name, p_destination_text) > 0.15
  ) INTO v_unmatched_destination;

  SELECT COALESCE(jsonb_agg(row_to_json(m.*) ORDER BY m.match_score DESC), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT
      r.id                                                    AS route_id,
      r.name                                                  AS route_name,
      r.start_building_id,
      sb.name                                                 AS start_building_name,
      r.end_building_id,
      eb.name                                                 AS end_building_name,
      r.difficulty,
      r.tags,
      r.total_distance_m,
      ROUND((r.total_distance_m / 1.2)::numeric, 0)::integer AS walk_time_estimate_s,
      mb.sim                                                  AS destination_similarity,
      ST_Distance(
        v_user_point,
        ST_StartPoint(r.path)::geography
      )                                                       AS distance_to_start_m,
      (mb.sim * 0.5)
        + (1.0 / GREATEST(r.total_distance_m, 1) * 0.3)
        + (CASE r.difficulty
             WHEN 'easy'     THEN 0.2
             WHEN 'moderate' THEN 0.1
             ELSE 0.0
           END)                                               AS match_score
    FROM routes r
    JOIN buildings sb ON sb.id = r.start_building_id
    JOIN buildings eb ON eb.id = r.end_building_id
    JOIN (
      SELECT id, name, similarity(name, p_destination_text) AS sim
      FROM buildings
      WHERE campus_id  = p_campus_id
        AND deleted_at IS NULL
        AND similarity(name, p_destination_text) > 0.15
    ) mb ON mb.id = r.end_building_id
    WHERE r.campus_id     = p_campus_id
      AND r.status        = 'published'
      AND r.deleted_at    IS NULL
      AND r.path          IS NOT NULL
      AND r.start_building_id = v_nearest_building_id
    ORDER BY match_score DESC
    LIMIT p_limit
  ) m;

  RETURN jsonb_build_object(
    'matches',                v_matches,
    'nearest_building_id',    v_nearest_building_id,
    'nearest_building_name',  v_nearest_building_name,
    'unmatched_destination',  v_unmatched_destination
  );
END;
$$;


ALTER FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_route"("route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."publish_route"("route_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_route_content_hash"("p_route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT COALESCE(
    encode(
      sha256(
        string_agg(
          position::text || ',' || ST_AsText(geom),
          '|' ORDER BY position
        )::bytea
      ),
      'hex'
    ),
    encode(sha256(''::bytea), 'hex')  -- deterministic empty-route sentinel
  )
  INTO v_hash
  FROM waypoints
  WHERE route_id = p_route_id;

  UPDATE routes SET content_hash = v_hash WHERE id = p_route_id;
END;
$$;


ALTER FUNCTION "public"."recompute_route_content_hash"("p_route_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retract_route"("route_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

  INSERT INTO activity_log (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'route.retract', 'route', v_source_route_id::text);
END;
$$;


ALTER FUNCTION "public"."retract_route"("route_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_route"("p_campus_id" "uuid", "p_name" "text", "p_from_label" "text", "p_to_label" "text", "p_start_building_id" "uuid", "p_end_building_id" "uuid", "p_difficulty" "text", "p_tags" "text"[], "p_recorded_duration_sec" integer, "p_waypoints" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_route_id uuid;
BEGIN
  IF NOT (current_user_role() IN ('admin', 'om_specialist', 'volunteer')) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF jsonb_array_length(p_waypoints) = 0 THEN
    RAISE EXCEPTION 'no_waypoints';
  END IF;

  -- Validate campus exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM campuses WHERE id = p_campus_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'campus_not_found';
  END IF;

  -- Validate start building belongs to the supplied campus (when provided)
  IF p_start_building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM buildings WHERE id = p_start_building_id AND campus_id = p_campus_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'start_building_not_in_campus';
  END IF;

  -- Validate end building belongs to the supplied campus (when provided)
  IF p_end_building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM buildings WHERE id = p_end_building_id AND campus_id = p_campus_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'end_building_not_in_campus';
  END IF;

  -- a. INSERT route row; status starts as 'pending_save' so it is invisible
  --    to all list/map queries while the transaction is open.
  INSERT INTO routes (
    campus_id, name, from_label, to_label,
    start_building_id, end_building_id,
    difficulty, tags, status,
    recorded_by, recorded_at, recorded_duration_sec
  ) VALUES (
    p_campus_id, p_name, p_from_label, p_to_label,
    p_start_building_id, p_end_building_id,
    p_difficulty, p_tags, 'pending_save',
    auth.uid(), now(), p_recorded_duration_sec
  )
  RETURNING id INTO v_route_id;

  -- b. INSERT waypoints from the JSONB array.
  --    The waypoints_content_hash trigger fires after each row, keeping
  --    content_hash current. Heading is nullable (NULL when speed < 0.5 m/s).
  INSERT INTO waypoints (
    route_id, position, recorded_at, geom,
    heading, annotation_text, annotation_audio_url, photo_url
  )
  SELECT
    v_route_id,
    (wp->>'position')::float,
    to_timestamp((wp->>'captured_at')::bigint / 1000.0),
    ST_SetSRID(
      ST_MakePoint(
        (wp->>'longitude')::float,
        (wp->>'latitude')::float
      ),
      4326
    ),
    CASE
      WHEN wp->>'heading' IS NOT NULL AND wp->>'heading' != 'null'
      THEN (wp->>'heading')::float
      ELSE NULL
    END,
    NULLIF(wp->>'annotation_text', ''),
    NULLIF(wp->>'annotation_audio_url', ''),
    NULLIF(wp->>'photo_url', '')
  FROM jsonb_array_elements(p_waypoints) AS wp;

  -- c. Materialise LineString path and total distance; transition to 'draft'.
  --    ST_MakeLine aggregates ordered waypoint geometries.
  --    content_hash was maintained by the per-row trigger in step b.
  UPDATE routes SET
    path = (
      SELECT ST_MakeLine(geom ORDER BY position)
      FROM   waypoints
      WHERE  route_id = v_route_id
    ),
    total_distance_m = (
      SELECT ST_Length(
        ST_MakeLine(geom ORDER BY position)::geography
      )
      FROM   waypoints
      WHERE  route_id = v_route_id
    ),
    status     = 'draft',
    updated_at = now()
  WHERE id = v_route_id;

  RETURN v_route_id;
END;
$$;


ALTER FUNCTION "public"."save_route"("p_campus_id" "uuid", "p_name" "text", "p_from_label" "text", "p_to_label" "text", "p_start_building_id" "uuid", "p_end_building_id" "uuid", "p_difficulty" "text", "p_tags" "text"[], "p_recorded_duration_sec" integer, "p_waypoints" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_geom_from_coordinate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.coordinate IS NOT NULL THEN
    NEW.geom := ST_SetSRID(
      ST_MakePoint(
        (NEW.coordinate->>'longitude')::float,
        (NEW.coordinate->>'latitude')::float
      ), 4326
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_geom_from_coordinate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waypoints_after_delete_stmt"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM recompute_route_content_hash(route_id)
  FROM (SELECT DISTINCT route_id FROM deleted) AS changed;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."waypoints_after_delete_stmt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waypoints_after_insert_update_stmt"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM recompute_route_content_hash(route_id)
  FROM (SELECT DISTINCT route_id FROM inserted) AS changed;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."waypoints_after_insert_update_stmt"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_log_target_type_check" CHECK (("target_type" = ANY (ARRAY['user'::"text", 'route'::"text", 'campus'::"text"])))
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."building_entrances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "building_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "coordinate" "jsonb" NOT NULL,
    "is_main" boolean DEFAULT false NOT NULL,
    "accessibility_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geom" "extensions"."geometry"(Point,4326)
);


ALTER TABLE "public"."building_entrances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campus_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "outline" "extensions"."geometry"(Polygon,4326) NOT NULL,
    "entrances" "extensions"."geometry"(MultiPoint,4326),
    "floors" integer DEFAULT 1 NOT NULL,
    "hours" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "short_name" "text",
    "category" "text" DEFAULT 'other'::"text",
    "description" "text",
    CONSTRAINT "buildings_category_check" CHECK (("category" = ANY (ARRAY['academic'::"text", 'residential'::"text", 'dining'::"text", 'administrative'::"text", 'athletic'::"text", 'medical'::"text", 'utility'::"text", 'outdoor'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "location" "extensions"."geometry"(Point,4326) NOT NULL,
    "bounds" "extensions"."geometry"(Polygon,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "security_phone" "text",
    "short_name" "text",
    "default_zoom" integer DEFAULT 16
);


ALTER TABLE "public"."campuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hazards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campus_id" "uuid" NOT NULL,
    "route_id" "uuid",
    "waypoint_id" "uuid",
    "type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "coordinate" "jsonb" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "geom" "extensions"."geometry"(Point,4326),
    CONSTRAINT "hazards_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "hazards_type_check" CHECK (("type" = ANY (ARRAY['uneven_surface'::"text", 'construction'::"text", 'stairs_unmarked'::"text", 'low_clearance'::"text", 'seasonal'::"text", 'wet_surface'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."hazards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pois" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campus_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "coordinate" "jsonb" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geom" "extensions"."geometry"(Point,4326),
    CONSTRAINT "pois_category_check" CHECK (("category" = ANY (ARRAY['security'::"text", 'restroom'::"text", 'water_fountain'::"text", 'elevator'::"text", 'emergency_phone'::"text", 'parking'::"text", 'transit'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."pois" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "campus_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campus_id" "uuid" NOT NULL,
    "start_building_id" "uuid",
    "end_building_id" "uuid",
    "name" "text" NOT NULL,
    "difficulty" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'pending_save'::"text" NOT NULL,
    "path" "extensions"."geometry"(LineString,4326),
    "total_distance_m" double precision,
    "content_hash" "text",
    "recorded_by" "uuid" NOT NULL,
    "published_by" "uuid",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "from_label" "text" NOT NULL,
    "to_label" "text" NOT NULL,
    "recorded_duration_sec" integer,
    "recorded_at" timestamp with time zone,
    "description" "text",
    "reverse_route_id" "uuid",
    CONSTRAINT "routes_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'moderate'::"text", 'hard'::"text"]))),
    CONSTRAINT "routes_published_requires_hash" CHECK ((("status" <> 'published'::"text") OR ("content_hash" IS NOT NULL))),
    CONSTRAINT "routes_status_check" CHECK (("status" = ANY (ARRAY['pending_save'::"text", 'draft'::"text", 'published'::"text", 'retracted'::"text"])))
);


ALTER TABLE "public"."routes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_buildings" WITH ("security_invoker"='true') AS
 SELECT "id",
    "campus_id" AS "campusId",
    "name",
    COALESCE("short_name", "name") AS "shortName",
    COALESCE("category", 'other'::"text") AS "category",
    "description",
    ((("extensions"."st_asgeojson"("outline"))::"jsonb" -> 'coordinates'::"text") -> 0) AS "footprint",
    COALESCE(( SELECT
                CASE
                    WHEN ("be"."geom" IS NOT NULL) THEN "jsonb_build_object"('latitude', "extensions"."st_y"("be"."geom"), 'longitude', "extensions"."st_x"("be"."geom"))
                    ELSE NULL::"jsonb"
                END AS "case"
           FROM "public"."building_entrances" "be"
          WHERE (("be"."building_id" = "b"."id") AND ("be"."is_main" = true))
         LIMIT 1), "jsonb_build_object"('latitude', "extensions"."st_y"("extensions"."st_centroid"("outline")), 'longitude', "extensions"."st_x"("extensions"."st_centroid"("outline")))) AS "mainEntrance",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('id', "be"."id", 'buildingId', "be"."building_id", 'name', "be"."name", 'coordinate',
                CASE
                    WHEN ("be"."geom" IS NOT NULL) THEN "jsonb_build_object"('latitude', "extensions"."st_y"("be"."geom"), 'longitude', "extensions"."st_x"("be"."geom"))
                    ELSE NULL::"jsonb"
                END, 'isMain', "be"."is_main", 'accessibilityNotes', "be"."accessibility_notes") ORDER BY "be"."is_main" DESC, "be"."name") AS "jsonb_agg"
           FROM "public"."building_entrances" "be"
          WHERE ("be"."building_id" = "b"."id")), '[]'::"jsonb") AS "entrances",
    "floors" AS "floor",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt"
   FROM "public"."buildings" "b"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."v_buildings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_campuses" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    COALESCE("short_name", "name") AS "shortName",
    "jsonb_build_object"('latitude', "extensions"."st_y"(("location")::"extensions"."geometry"), 'longitude', "extensions"."st_x"(("location")::"extensions"."geometry")) AS "center",
    "jsonb_build_object"('northEast', "jsonb_build_object"('latitude', "extensions"."st_ymax"((("bounds")::"extensions"."geometry")::"extensions"."box3d"), 'longitude', "extensions"."st_xmax"((("bounds")::"extensions"."geometry")::"extensions"."box3d")), 'southWest', "jsonb_build_object"('latitude', "extensions"."st_ymin"((("bounds")::"extensions"."geometry")::"extensions"."box3d"), 'longitude', "extensions"."st_xmin"((("bounds")::"extensions"."geometry")::"extensions"."box3d"))) AS "bounds",
    COALESCE("default_zoom", 16) AS "defaultZoom",
    "security_phone" AS "securityPhone",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt",
    ((("extensions"."st_asgeojson"("bounds"))::"jsonb" -> 'coordinates'::"text") -> 0) AS "footprint"
   FROM "public"."campuses" "c"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."v_campuses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_hazards" WITH ("security_invoker"='true') AS
 SELECT "id",
    "campus_id" AS "campusId",
    "route_id" AS "routeId",
    "waypoint_id" AS "waypointId",
    "type",
    "severity",
        CASE
            WHEN ("geom" IS NOT NULL) THEN "jsonb_build_object"('latitude', "extensions"."st_y"("geom"), 'longitude', "extensions"."st_x"("geom"))
            ELSE NULL::"jsonb"
        END AS "coordinate",
    "title",
    "description",
    "expires_at" AS "expiresAt",
    "resolved_at" AS "resolvedAt",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt"
   FROM "public"."hazards" "h"
  WHERE ("resolved_at" IS NULL);


ALTER VIEW "public"."v_hazards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waypoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "position" double precision NOT NULL,
    "recorded_at" timestamp with time zone NOT NULL,
    "geom" "extensions"."geometry"(Point,4326) NOT NULL,
    "heading" double precision,
    "annotation_text" "text",
    "annotation_audio_url" "text",
    "photo_url" "text",
    "hazard_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'regular'::"text",
    CONSTRAINT "waypoints_hazard_type_check" CHECK (("hazard_type" = ANY (ARRAY['step'::"text", 'door'::"text", 'crossing'::"text", 'surface'::"text", 'other'::"text"]))),
    CONSTRAINT "waypoints_heading_check" CHECK ((("heading" >= (0)::double precision) AND ("heading" < (360)::double precision))),
    CONSTRAINT "waypoints_type_check" CHECK (("type" = ANY (ARRAY['start'::"text", 'end'::"text", 'turn'::"text", 'decision_point'::"text", 'landmark'::"text", 'hazard'::"text", 'door'::"text", 'elevator'::"text", 'stairs'::"text", 'ramp'::"text", 'crossing'::"text", 'regular'::"text"])))
);


ALTER TABLE "public"."waypoints" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_routes" WITH ("security_invoker"='true') AS
 SELECT "id",
    "campus_id" AS "campusId",
    "name",
    "description",
    "start_building_id" AS "fromBuildingId",
    "end_building_id" AS "toBuildingId",
    "from_label" AS "fromLabel",
    "to_label" AS "toLabel",
    "status",
    "total_distance_m" AS "distanceMeters",
    "recorded_duration_sec" AS "recordedDurationSec",
    ("recorded_by")::"text" AS "recordedBy",
    "recorded_at" AS "recordedAt",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('id', "w"."id", 'routeId', "w"."route_id", 'sequenceIndex', "w"."position", 'coordinate', "jsonb_build_object"('latitude', "extensions"."st_y"("w"."geom"), 'longitude', "extensions"."st_x"("w"."geom"), 'altitude', NULL::"unknown"), 'type', COALESCE("w"."type", 'regular'::"text"), 'headingOut', "w"."heading", 'audioLabel', "w"."annotation_text", 'description', NULL::"unknown", 'photoUrl', "w"."photo_url", 'audioAnnotationUrl', "w"."annotation_audio_url", 'createdAt', "w"."created_at") ORDER BY "w"."position") AS "jsonb_agg"
           FROM "public"."waypoints" "w"
          WHERE ("w"."route_id" = "r"."id")), '[]'::"jsonb") AS "waypoints",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('id', "h"."id", 'campusId', "h"."campus_id", 'routeId', "h"."route_id", 'waypointId', "h"."waypoint_id", 'type', "h"."type", 'severity', "h"."severity", 'coordinate',
                CASE
                    WHEN ("h"."geom" IS NOT NULL) THEN "jsonb_build_object"('latitude', "extensions"."st_y"("h"."geom"), 'longitude', "extensions"."st_x"("h"."geom"))
                    ELSE NULL::"jsonb"
                END, 'title', "h"."title", 'description', "h"."description", 'expiresAt', "h"."expires_at", 'createdAt', "h"."created_at", 'updatedAt', "h"."updated_at")) AS "jsonb_agg"
           FROM "public"."hazards" "h"
          WHERE (("h"."route_id" = "r"."id") AND ("h"."resolved_at" IS NULL))), '[]'::"jsonb") AS "hazards"
   FROM "public"."routes" "r"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."v_routes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_waypoints" WITH ("security_invoker"='true') AS
 SELECT "id",
    "route_id" AS "routeId",
    "position" AS "sequenceIndex",
    "jsonb_build_object"('latitude', "extensions"."st_y"("geom"), 'longitude', "extensions"."st_x"("geom"), 'altitude', NULL::"unknown") AS "coordinate",
    COALESCE("type", 'regular'::"text") AS "type",
    "heading" AS "headingOut",
    "annotation_text" AS "audioLabel",
    NULL::"text" AS "description",
    "photo_url" AS "photoUrl",
    "annotation_audio_url" AS "audioAnnotationUrl",
    "created_at" AS "createdAt"
   FROM "public"."waypoints" "w";


ALTER VIEW "public"."v_waypoints" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."building_entrances"
    ADD CONSTRAINT "building_entrances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campuses"
    ADD CONSTRAINT "campuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hazards"
    ADD CONSTRAINT "hazards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pois"
    ADD CONSTRAINT "pois_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waypoints"
    ADD CONSTRAINT "waypoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waypoints"
    ADD CONSTRAINT "waypoints_route_id_position_key" UNIQUE ("route_id", "position");



CREATE INDEX "activity_log_actor_id_idx" ON "public"."activity_log" USING "btree" ("actor_id");



CREATE INDEX "activity_log_created_at_idx" ON "public"."activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "activity_log_target_id_idx" ON "public"."activity_log" USING "btree" ("target_id");



CREATE INDEX "building_entrances_building_id_idx" ON "public"."building_entrances" USING "btree" ("building_id");



CREATE INDEX "building_entrances_geom_idx" ON "public"."building_entrances" USING "gist" ("geom");



CREATE INDEX "buildings_campus_id_idx" ON "public"."buildings" USING "btree" ("campus_id");



CREATE INDEX "buildings_entrances_idx" ON "public"."buildings" USING "gist" ("entrances");



CREATE INDEX "buildings_name_idx" ON "public"."buildings" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "buildings_outline_idx" ON "public"."buildings" USING "gist" ("outline");



CREATE INDEX "buildings_to_tsvector_idx" ON "public"."buildings" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));



CREATE INDEX "campuses_bounds_idx" ON "public"."campuses" USING "gist" ("bounds");



CREATE INDEX "campuses_location_idx" ON "public"."campuses" USING "gist" ("location");



CREATE INDEX "hazards_campus_id_idx" ON "public"."hazards" USING "btree" ("campus_id");



CREATE INDEX "hazards_geom_idx" ON "public"."hazards" USING "gist" ("geom");



CREATE INDEX "hazards_route_id_idx" ON "public"."hazards" USING "btree" ("route_id");



CREATE INDEX "pois_campus_id_idx" ON "public"."pois" USING "btree" ("campus_id");



CREATE INDEX "pois_category_idx" ON "public"."pois" USING "btree" ("category");



CREATE INDEX "pois_geom_idx" ON "public"."pois" USING "gist" ("geom");



CREATE INDEX "profiles_campus_id_idx" ON "public"."profiles" USING "btree" ("campus_id");



CREATE INDEX "routes_campus_id_idx" ON "public"."routes" USING "btree" ("campus_id");



CREATE INDEX "routes_end_building_id_idx" ON "public"."routes" USING "btree" ("end_building_id");



CREATE INDEX "routes_path_idx" ON "public"."routes" USING "gist" ("path");



CREATE UNIQUE INDEX "routes_reverse_route_id_unique" ON "public"."routes" USING "btree" ("reverse_route_id") WHERE ("reverse_route_id" IS NOT NULL);



CREATE INDEX "routes_start_building_id_idx" ON "public"."routes" USING "btree" ("start_building_id");



CREATE INDEX "routes_status_idx" ON "public"."routes" USING "btree" ("status");



CREATE INDEX "waypoints_geom_idx" ON "public"."waypoints" USING "gist" ("geom");



CREATE INDEX "waypoints_route_id_idx" ON "public"."waypoints" USING "btree" ("route_id");



CREATE OR REPLACE TRIGGER "building_entrances_sync_geom" BEFORE INSERT OR UPDATE OF "coordinate" ON "public"."building_entrances" FOR EACH ROW EXECUTE FUNCTION "public"."sync_geom_from_coordinate"();



CREATE OR REPLACE TRIGGER "building_entrances_updated_at" BEFORE UPDATE ON "public"."building_entrances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "buildings_updated_at" BEFORE UPDATE ON "public"."buildings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campuses_updated_at" BEFORE UPDATE ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "hazards_sync_geom" BEFORE INSERT OR UPDATE OF "coordinate" ON "public"."hazards" FOR EACH ROW EXECUTE FUNCTION "public"."sync_geom_from_coordinate"();



CREATE OR REPLACE TRIGGER "hazards_updated_at" BEFORE UPDATE ON "public"."hazards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "pois_sync_geom" BEFORE INSERT OR UPDATE OF "coordinate" ON "public"."pois" FOR EACH ROW EXECUTE FUNCTION "public"."sync_geom_from_coordinate"();



CREATE OR REPLACE TRIGGER "pois_updated_at" BEFORE UPDATE ON "public"."pois" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "routes_updated_at" BEFORE UPDATE ON "public"."routes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "waypoints_content_hash_delete" AFTER DELETE ON "public"."waypoints" REFERENCING OLD TABLE AS "deleted" FOR EACH STATEMENT EXECUTE FUNCTION "public"."waypoints_after_delete_stmt"();



CREATE OR REPLACE TRIGGER "waypoints_content_hash_insert" AFTER INSERT ON "public"."waypoints" REFERENCING NEW TABLE AS "inserted" FOR EACH STATEMENT EXECUTE FUNCTION "public"."waypoints_after_insert_update_stmt"();



CREATE OR REPLACE TRIGGER "waypoints_content_hash_update" AFTER UPDATE ON "public"."waypoints" REFERENCING NEW TABLE AS "inserted" FOR EACH STATEMENT EXECUTE FUNCTION "public"."waypoints_after_insert_update_stmt"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."building_entrances"
    ADD CONSTRAINT "building_entrances_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hazards"
    ADD CONSTRAINT "hazards_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hazards"
    ADD CONSTRAINT "hazards_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hazards"
    ADD CONSTRAINT "hazards_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hazards"
    ADD CONSTRAINT "hazards_waypoint_id_fkey" FOREIGN KEY ("waypoint_id") REFERENCES "public"."waypoints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pois"
    ADD CONSTRAINT "pois_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_end_building_id_fkey" FOREIGN KEY ("end_building_id") REFERENCES "public"."buildings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_reverse_route_id_fkey" FOREIGN KEY ("reverse_route_id") REFERENCES "public"."routes"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_start_building_id_fkey" FOREIGN KEY ("start_building_id") REFERENCES "public"."buildings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waypoints"
    ADD CONSTRAINT "waypoints_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_log_deny_insert" ON "public"."activity_log" FOR INSERT WITH CHECK (false);



CREATE POLICY "activity_log_read_admin" ON "public"."activity_log" FOR SELECT USING (("public"."current_user_role"() = 'admin'::"text"));



ALTER TABLE "public"."building_entrances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "building_entrances_anon_read" ON "public"."building_entrances" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."buildings" "b"
     JOIN "public"."campuses" "c" ON (("c"."id" = "b"."campus_id")))
  WHERE (("b"."id" = "building_entrances"."building_id") AND ("b"."deleted_at" IS NULL) AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "building_entrances_delete" ON "public"."building_entrances" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "building_entrances_insert" ON "public"."building_entrances" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "building_entrances_read" ON "public"."building_entrances" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."buildings" "b"
  WHERE (("b"."id" = "building_entrances"."building_id") AND ("b"."deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("b"."campus_id" = "public"."current_user_campus"())))))));



CREATE POLICY "building_entrances_update" ON "public"."building_entrances" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buildings_anon_read" ON "public"."buildings" FOR SELECT USING ((("deleted_at" IS NULL) AND ("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "buildings"."campus_id") AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "buildings_delete" ON "public"."buildings" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "buildings_insert" ON "public"."buildings" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "buildings_read" ON "public"."buildings" FOR SELECT USING ((("deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("campus_id" = "public"."current_user_campus"())))));



CREATE POLICY "buildings_update" ON "public"."buildings" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



ALTER TABLE "public"."campuses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campuses_anon_read" ON "public"."campuses" FOR SELECT USING ((("deleted_at" IS NULL) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "campuses_delete" ON "public"."campuses" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "campuses_insert" ON "public"."campuses" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "campuses_read" ON "public"."campuses" FOR SELECT USING ((("deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("id" = "public"."current_user_campus"())))));



CREATE POLICY "campuses_update" ON "public"."campuses" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



ALTER TABLE "public"."hazards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hazards_anon_read" ON "public"."hazards" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "hazards"."campus_id") AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "hazards_delete" ON "public"."hazards" FOR DELETE USING (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"])));



CREATE POLICY "hazards_insert" ON "public"."hazards" FOR INSERT WITH CHECK (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"])));



CREATE POLICY "hazards_read" ON "public"."hazards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "hazards"."campus_id") AND ("c"."deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("c"."id" = "public"."current_user_campus"())))))));



CREATE POLICY "hazards_update" ON "public"."hazards" FOR UPDATE USING (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"]))) WITH CHECK (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"])));



ALTER TABLE "public"."pois" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pois_anon_read" ON "public"."pois" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "pois"."campus_id") AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "pois_delete" ON "public"."pois" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "pois_insert" ON "public"."pois" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "pois_read" ON "public"."pois" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "pois"."campus_id") AND ("c"."deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("c"."id" = "public"."current_user_campus"())))))));



CREATE POLICY "pois_update" ON "public"."pois" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "profiles_read" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'admin'::"text") OR (("public"."current_user_role"() = 'om_specialist'::"text") AND ("campus_id" = "public"."current_user_campus"()))));



CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("is_active" = ( SELECT "profiles_1"."is_active"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



ALTER TABLE "public"."routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "routes_anon_read" ON "public"."routes" FOR SELECT USING ((("deleted_at" IS NULL) AND ("status" = 'published'::"text") AND ("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campuses" "c"
  WHERE (("c"."id" = "routes"."campus_id") AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "routes_delete" ON "public"."routes" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "routes_insert" ON "public"."routes" FOR INSERT WITH CHECK ((("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) AND (("public"."current_user_role"() <> 'volunteer'::"text") OR ("status" = 'pending_save'::"text"))));



CREATE POLICY "routes_read" ON "public"."routes" FOR SELECT USING ((("deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("status" = 'published'::"text") AND ("campus_id" = "public"."current_user_campus"())))));



CREATE POLICY "routes_update" ON "public"."routes" FOR UPDATE USING (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"]))) WITH CHECK (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"])));



ALTER TABLE "public"."waypoints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waypoints_anon_read" ON "public"."waypoints" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "waypoints"."route_id") AND ("r"."deleted_at" IS NULL) AND ("r"."status" = 'published'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."campuses" "c"
          WHERE (("c"."id" = "r"."campus_id") AND ("c"."deleted_at" IS NULL)))))))));



CREATE POLICY "waypoints_delete" ON "public"."waypoints" FOR DELETE USING (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text"])));



CREATE POLICY "waypoints_insert" ON "public"."waypoints" FOR INSERT WITH CHECK ((("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "waypoints"."route_id") AND ("r"."status" = ANY (ARRAY['pending_save'::"text", 'draft'::"text"])))))));



CREATE POLICY "waypoints_read" ON "public"."waypoints" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "waypoints"."route_id") AND ("r"."deleted_at" IS NULL) AND (("public"."current_user_role"() = ANY (ARRAY['admin'::"text", 'om_specialist'::"text", 'volunteer'::"text"])) OR (("public"."current_user_role"() = 'student'::"text") AND ("r"."status" = 'published'::"text") AND ("r"."campus_id" = "public"."current_user_campus"())))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_building_stub"("p_campus_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."create_building_stub"("p_campus_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_building_stub"("p_campus_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_campus"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_campus"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_campus"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_route"("p_lat" double precision, "p_lng" double precision, "p_destination_text" "text", "p_campus_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_route"("route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_route"("route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_route"("route_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_route_content_hash"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_route_content_hash"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_route_content_hash"("p_route_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."retract_route"("route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."retract_route"("route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retract_route"("route_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_route"("p_campus_id" "uuid", "p_name" "text", "p_from_label" "text", "p_to_label" "text", "p_start_building_id" "uuid", "p_end_building_id" "uuid", "p_difficulty" "text", "p_tags" "text"[], "p_recorded_duration_sec" integer, "p_waypoints" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_route"("p_campus_id" "uuid", "p_name" "text", "p_from_label" "text", "p_to_label" "text", "p_start_building_id" "uuid", "p_end_building_id" "uuid", "p_difficulty" "text", "p_tags" "text"[], "p_recorded_duration_sec" integer, "p_waypoints" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_route"("p_campus_id" "uuid", "p_name" "text", "p_from_label" "text", "p_to_label" "text", "p_start_building_id" "uuid", "p_end_building_id" "uuid", "p_difficulty" "text", "p_tags" "text"[], "p_recorded_duration_sec" integer, "p_waypoints" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_geom_from_coordinate"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_geom_from_coordinate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_geom_from_coordinate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."waypoints_after_delete_stmt"() TO "anon";
GRANT ALL ON FUNCTION "public"."waypoints_after_delete_stmt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."waypoints_after_delete_stmt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."waypoints_after_insert_update_stmt"() TO "anon";
GRANT ALL ON FUNCTION "public"."waypoints_after_insert_update_stmt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."waypoints_after_insert_update_stmt"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."building_entrances" TO "anon";
GRANT ALL ON TABLE "public"."building_entrances" TO "authenticated";
GRANT ALL ON TABLE "public"."building_entrances" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON TABLE "public"."campuses" TO "anon";
GRANT ALL ON TABLE "public"."campuses" TO "authenticated";
GRANT ALL ON TABLE "public"."campuses" TO "service_role";



GRANT ALL ON TABLE "public"."hazards" TO "anon";
GRANT ALL ON TABLE "public"."hazards" TO "authenticated";
GRANT ALL ON TABLE "public"."hazards" TO "service_role";



GRANT ALL ON TABLE "public"."pois" TO "anon";
GRANT ALL ON TABLE "public"."pois" TO "authenticated";
GRANT ALL ON TABLE "public"."pois" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."routes" TO "anon";
GRANT ALL ON TABLE "public"."routes" TO "authenticated";
GRANT ALL ON TABLE "public"."routes" TO "service_role";



GRANT ALL ON TABLE "public"."v_buildings" TO "anon";
GRANT ALL ON TABLE "public"."v_buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."v_buildings" TO "service_role";



GRANT ALL ON TABLE "public"."v_campuses" TO "anon";
GRANT ALL ON TABLE "public"."v_campuses" TO "authenticated";
GRANT ALL ON TABLE "public"."v_campuses" TO "service_role";



GRANT ALL ON TABLE "public"."v_hazards" TO "anon";
GRANT ALL ON TABLE "public"."v_hazards" TO "authenticated";
GRANT ALL ON TABLE "public"."v_hazards" TO "service_role";



GRANT ALL ON TABLE "public"."waypoints" TO "anon";
GRANT ALL ON TABLE "public"."waypoints" TO "authenticated";
GRANT ALL ON TABLE "public"."waypoints" TO "service_role";



GRANT ALL ON TABLE "public"."v_routes" TO "anon";
GRANT ALL ON TABLE "public"."v_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."v_routes" TO "service_role";



GRANT ALL ON TABLE "public"."v_waypoints" TO "anon";
GRANT ALL ON TABLE "public"."v_waypoints" TO "authenticated";
GRANT ALL ON TABLE "public"."v_waypoints" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- ============================================================
-- CAMPUS BOUNDARY MANAGEMENT RPCs
-- Creates and replaces campuses from explicit boundary polygons,
-- and keeps soft-delete support in the baseline.
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."create_campus_with_bounds"(
  "p_name" text,
  "p_short_name" text,
  "p_boundary_wkt" text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_campus_id uuid;
  v_bounds geometry(Polygon, 4326);
  v_centroid geometry(Point, 4326);
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

  IF p_boundary_wkt IS NULL OR trim(p_boundary_wkt) = '' THEN
    RAISE EXCEPTION 'Campus boundary is required';
  END IF;

  BEGIN
    v_bounds := ST_GeomFromEWKT(p_boundary_wkt)::geometry(Polygon, 4326);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid campus boundary polygon';
  END;

  IF GeometryType(v_bounds) <> 'POLYGON' THEN
    RAISE EXCEPTION 'Campus boundary must be a polygon';
  END IF;

  IF NOT ST_IsValid(v_bounds) THEN
    RAISE EXCEPTION 'Campus boundary polygon is invalid';
  END IF;

  IF ST_NPoints(v_bounds) < 4 THEN
    RAISE EXCEPTION 'Campus boundary must contain at least 3 points';
  END IF;

  v_centroid := ST_Centroid(v_bounds)::geometry(Point, 4326);

  INSERT INTO campuses (name, short_name, location, bounds)
  VALUES (
    trim(p_name),
    NULLIF(trim(COALESCE(p_short_name, p_name)), ''),
    v_centroid,
    v_bounds
  )
  RETURNING id INTO v_campus_id;

  RETURN v_campus_id;
END;
$$;

ALTER FUNCTION "public"."create_campus_with_bounds"(text, text, text) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_campus_with_bounds"(text, text, text) TO "authenticated";


CREATE OR REPLACE FUNCTION "public"."create_bootstrap_campus_with_bounds"(
  "p_name" text,
  "p_boundary_wkt" text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_campus_id uuid;
  v_caller_id uuid;
  v_bounds geometry(Polygon, 4326);
  v_centroid geometry(Point, 4326);
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_active = true) THEN
    RAISE EXCEPTION 'Profile not found. Complete signup before creating a campus.';
  END IF;

  IF EXISTS (SELECT 1 FROM campuses WHERE deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Bootstrap unavailable: campuses already exist.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Campus name is required';
  END IF;

  IF p_boundary_wkt IS NULL OR trim(p_boundary_wkt) = '' THEN
    RAISE EXCEPTION 'Campus boundary is required';
  END IF;

  BEGIN
    v_bounds := ST_GeomFromEWKT(p_boundary_wkt)::geometry(Polygon, 4326);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid campus boundary polygon';
  END;

  IF GeometryType(v_bounds) <> 'POLYGON' THEN
    RAISE EXCEPTION 'Campus boundary must be a polygon';
  END IF;

  IF NOT ST_IsValid(v_bounds) THEN
    RAISE EXCEPTION 'Campus boundary polygon is invalid';
  END IF;

  IF ST_NPoints(v_bounds) < 4 THEN
    RAISE EXCEPTION 'Campus boundary must contain at least 3 points';
  END IF;

  v_centroid := ST_Centroid(v_bounds)::geometry(Point, 4326);

  INSERT INTO campuses (name, short_name, location, bounds)
  VALUES (
    trim(p_name),
    trim(p_name),
    v_centroid,
    v_bounds
  )
  RETURNING id INTO v_campus_id;

  UPDATE profiles
  SET role = 'admin', campus_id = v_campus_id
  WHERE id = v_caller_id;

  RETURN v_campus_id;
END;
$$;

ALTER FUNCTION "public"."create_bootstrap_campus_with_bounds"(text, text) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_bootstrap_campus_with_bounds"(text, text) TO "authenticated";


CREATE OR REPLACE FUNCTION "public"."replace_campus_bounds"(
  "p_campus_id" uuid,
  "p_boundary_wkt" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bounds geometry(Polygon, 4326);
  v_centroid geometry(Point, 4326);
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

  IF p_boundary_wkt IS NULL OR trim(p_boundary_wkt) = '' THEN
    RAISE EXCEPTION 'Campus boundary is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM campuses WHERE id = p_campus_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Campus not found';
  END IF;

  BEGIN
    v_bounds := ST_GeomFromEWKT(p_boundary_wkt)::geometry(Polygon, 4326);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid campus boundary polygon';
  END;

  IF GeometryType(v_bounds) <> 'POLYGON' THEN
    RAISE EXCEPTION 'Campus boundary must be a polygon';
  END IF;

  IF NOT ST_IsValid(v_bounds) THEN
    RAISE EXCEPTION 'Campus boundary polygon is invalid';
  END IF;

  IF ST_NPoints(v_bounds) < 4 THEN
    RAISE EXCEPTION 'Campus boundary must contain at least 3 points';
  END IF;

  v_centroid := ST_Centroid(v_bounds)::geometry(Point, 4326);

  UPDATE campuses
  SET location = v_centroid,
      bounds = v_bounds
  WHERE id = p_campus_id
    AND deleted_at IS NULL;
END;
$$;

ALTER FUNCTION "public"."replace_campus_bounds"(uuid, text) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_campus_bounds"(uuid, text) TO "authenticated";


CREATE OR REPLACE FUNCTION "public"."soft_delete_campus"(
  "p_campus_id" uuid
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

  DELETE FROM campuses
  WHERE id = p_campus_id;
END;
$$;

ALTER FUNCTION "public"."soft_delete_campus"(uuid) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."soft_delete_campus"(uuid) TO "authenticated";
