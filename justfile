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
check:
    yarn workspace @echoecho/shared run typecheck
    yarn workspace @echoecho/admin run typecheck
    yarn workspace @echoecho/student run typecheck

# Run linters across workspaces
lint:
    yarn workspace @echoecho/admin run lint
    yarn workspace @echoecho/student run lint

# Run tests across workspaces
test:
    yarn workspace @echoecho/shared run test
    yarn workspace @echoecho/admin run test
    yarn workspace @echoecho/student run test

# Full CI gate: typecheck + lint + test
ci: check lint test

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

# Clean all node_modules and caches
clean:
    find . -name node_modules -type d -prune -exec rm -rf {} +
    find . -name .expo -type d -prune -exec rm -rf {} +
    yarn cache clean
