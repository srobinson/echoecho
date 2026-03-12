# EchoEcho monorepo commands
# Usage: just <command>

# Install all workspace dependencies
install:
    yarn install

# Run the admin app
admin:
    yarn workspace @echoecho/admin start

# Run the student app
student:
    yarn workspace @echoecho/student start

# Typecheck all workspaces
typecheck:
    turbo typecheck

# Run linters across workspaces
lint:
    turbo lint

# Run tests across workspaces
test:
    turbo test

# Full CI gate: typecheck + lint + test
check: typecheck lint

# Reproduce the exact CI pipeline locally (immutable install, deno lint)
ci-local:
    yarn install --immutable
    turbo typecheck lint test
    deno lint supabase/functions/

# ── Supabase ───────────────────────────────────────────────

# Start local Supabase stack (requires supabase CLI)
supabase-start:
    supabase start

# Stop local Supabase stack
supabase-stop:
    supabase stop

# Apply pending migrations to local instance
supabase-migrate:
    supabase db push

# Reset local database (drop + migrate + seed)
supabase-reset:
    supabase db reset

# Push migrations to staging (requires SUPABASE_ACCESS_TOKEN + STAGING_PROJECT_REF env vars)
supabase-push-staging:
    supabase db push --project-ref $STAGING_PROJECT_REF

# Collapse all existing migrations into a single clean baseline from the live remote schema.
# Requires: SUPABASE_ACCESS_TOKEN + STAGING_PROJECT_REF env vars, supabase CLI, sed.
#
# What it does:
#   1. Dumps the current remote schema
#   2. Fixes the profiles_insert policy to admin-only (migration 022 equivalent)
#   3. Appends the create_bootstrap_campus RPC
#   4. Writes it as supabase/migrations/20260310000001_baseline.sql
#   5. Deletes all other numbered migration files
#   6. Marks the baseline as already applied in Supabase migration history
#
# After running this, `supabase db push` should report no pending migrations.
supabase-baseline:
    #!/usr/bin/env bash
    set -euo pipefail

    : "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

    MIGRATIONS_DIR="supabase/migrations"
    BASELINE="${MIGRATIONS_DIR}/20260310000001_baseline.sql"
    DUMP_TMP=$(mktemp /tmp/echoecho_dump_XXXXXX.sql)

    echo "→ Dumping remote schema..."
    supabase db dump --project-ref "$STAGING_PROJECT_REF" > "$DUMP_TMP"

    echo "→ Building baseline migration..."
    {
      cat <<'HEADER'
    -- Migration: 20260310000001_baseline
    -- Single clean baseline generated from live remote schema.
    -- Replaces all prior incremental migrations.
    -- Generated: $(date -u +%Y-%m-%d)

    SET search_path TO public, extensions;

    HEADER

      # Fix profiles_insert: remove the self-insert clause (migration 022 equivalent)
      sed 's/CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (((\"public\".\"current_user_role\"() = '"'"'admin'"'"'::"text") OR ("id" = "auth"."uid"())));/CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("public"."current_user_role"() = '"'"'admin'"'"'::"text"));/' "$DUMP_TMP"

      cat <<'BOOTSTRAP'

    -- ============================================================
    -- BOOTSTRAP CAMPUS RPC
    -- Allows the first user on a fresh instance to create a campus
    -- and be promoted to admin atomically. Only works when no
    -- campuses exist.
    -- ============================================================

    CREATE OR REPLACE FUNCTION "public"."create_bootstrap_campus"(
      "p_name"      text,
      "p_latitude"  float8,
      "p_longitude" float8
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, extensions
    AS $$
    DECLARE
      v_campus_id     uuid;
      v_caller_id     uuid;
      v_bounds_offset constant float8 := 0.005;
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
      IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Campus name is required'; END IF;
      IF p_latitude  < -90  OR p_latitude  > 90  THEN RAISE EXCEPTION 'Invalid latitude';  END IF;
      IF p_longitude < -180 OR p_longitude > 180 THEN RAISE EXCEPTION 'Invalid longitude'; END IF;
      INSERT INTO campuses (name, short_name, location, bounds)
      VALUES (
        trim(p_name), trim(p_name),
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
        ST_SetSRID(ST_MakePolygon(ST_GeomFromText(format(
          'LINESTRING(%s %s, %s %s, %s %s, %s %s, %s %s)',
          p_longitude - v_bounds_offset, p_latitude - v_bounds_offset,
          p_longitude + v_bounds_offset, p_latitude - v_bounds_offset,
          p_longitude + v_bounds_offset, p_latitude + v_bounds_offset,
          p_longitude - v_bounds_offset, p_latitude + v_bounds_offset,
          p_longitude - v_bounds_offset, p_latitude - v_bounds_offset
        ))), 4326)
      )
      RETURNING id INTO v_campus_id;
      UPDATE profiles SET role = 'admin', campus_id = v_campus_id WHERE id = v_caller_id;
      RETURN v_campus_id;
    END;
    $$;

    ALTER FUNCTION "public"."create_bootstrap_campus"(text, float8, float8) OWNER TO "postgres";
    GRANT EXECUTE ON FUNCTION "public"."create_bootstrap_campus"(text, float8, float8) TO "authenticated";
    BOOTSTRAP
    } > "$BASELINE"

    echo "→ Removing old numbered migrations..."
    find "$MIGRATIONS_DIR" -maxdepth 1 -name '2026[0-9]*.sql' ! -name '20260310000001_baseline.sql' -delete

    echo "→ Marking baseline as applied in Supabase migration history..."
    supabase migration repair --status applied 20260310000001 --project-ref "$STAGING_PROJECT_REF"

    rm -f "$DUMP_TMP"
    echo "✓ Done. Run 'supabase db push --project-ref \$STAGING_PROJECT_REF' to confirm no pending migrations."

# Apply staging seed data (creates test users, campus, buildings, routes, hazards).
# Fully automated — no manual SQL steps required.
# Requires: STAGING_DB_URL, STAGING_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY.
supabase-seed-staging:
    node supabase/seed_staging_auth.cjs
    psql "$STAGING_DB_URL" -f supabase/seed_staging.sql

# Generate TypeScript types from the local database schema
supabase-types:
    supabase gen types typescript --local > packages/shared/src/types/database.ts

# ──────────────────────────────────────────────────────────

# Build admin app for iOS dev (requires Xcode)
build-admin-ios:
    yarn workspace @echoecho/admin ios

# Build student app for iOS dev (requires Xcode)
build-student-ios:
    yarn workspace @echoecho/student ios

# Build admin app for Android dev (requires Android Studio)
build-admin-android:
    yarn workspace @echoecho/admin android

# Build student app for Android dev (requires Android Studio)
build-student-android:
    yarn workspace @echoecho/student android

# Build/install admin debug APK on a specific Android device.
# Example:
#   just admin-android-device adb-R5CR50X37XA-ADP1cS._adb-tls-connect._tcp
admin-android-device device:
    ./scripts/android-device.sh admin "{{device}}" --build

# Build/install admin debug APK on a specific Android device, forcing a clean reinstall.
admin-android-device-fresh device:
    ./scripts/android-device.sh admin "{{device}}" --build --fresh

# Build/install student debug APK on a specific Android device.
student-android-device device:
    ./scripts/android-device.sh student "{{device}}" --build

# Build/install student debug APK on a specific Android device, forcing a clean reinstall.
student-android-device-fresh device:
    ./scripts/android-device.sh student "{{device}}" --build --fresh

# Clean all node_modules and caches
clean:
    find . -name node_modules -type d -prune -exec rm -rf {} +
    find . -name .expo -type d -prune -exec rm -rf {} +
    yarn cache clean
