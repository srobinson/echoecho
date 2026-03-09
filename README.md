# EchoEcho

Campus navigation for visually impaired students. Haptic feedback, voice input, and screen reader driven turn-by-turn guidance across campus grounds.

Two apps, one backend:

- **Admin** (`apps/admin/`) -- Route recording and campus management for O&M specialists and volunteers
- **Student** (`apps/student/`) -- Accessible navigation with haptic cues, audio instructions, and voice destination search

## Architecture

```
echoecho/
  apps/
    admin/          @echoecho/admin    Expo Router (iOS/Android)
    student/        @echoecho/student  Expo Router (iOS/Android)
  packages/
    shared/         @echoecho/shared   Types, geo utils, Supabase client, haptic timings
    ui/             @echoecho/ui       Chart components, design tokens, bottom sheets
  supabase/
    functions/      Edge Functions (Deno): auth webhook, user management, storage cleanup
    migrations/     23 sequential migrations (PostGIS, RLS, RPCs, indexes)
    seed.sql        Local dev seed data
    seed_staging.sql  Staging seed (TSBVI campus, buildings, routes, hazards)
  docs/             Device verification guide, haptic timing reference
```

Workspaces are resolved via Babel `module-resolver` aliases pointing to TypeScript source. Metro `watchFolders` includes the workspace root for hot-reload across packages.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | React Native 0.76, Expo 52, Expo Router v4 |
| State | Zustand, AsyncStorage, expo-sqlite (offline cache) |
| Backend | Supabase (PostgreSQL 17 + PostGIS, Auth, Storage, Edge Functions) |
| Maps | Mapbox GL (`@rnmapbox/maps`) in admin app |
| Navigation | GPS + PDR (pedestrian dead reckoning via IMU sensors) |
| Haptics | Four coded timing schemes (S1-S4) mapping bearing to vibration patterns |
| Voice | `expo-speech-recognition` for destination input, `expo-speech` for audio guidance |
| Build | Yarn 4.9, EAS Build, TypeScript 5.3 |

## Prerequisites

- Node 20+
- Yarn 4 (`corepack enable && corepack prepare yarn@4.9.1`)
- [just](https://github.com/casey/just) command runner
- Supabase CLI (`brew install supabase/tap/supabase`)
- Android Studio + JDK 17 (Android builds)
- Xcode (iOS builds)

## Setup

```bash
# Install dependencies
just install

# Copy environment files (gitignored, once per machine)
cp .env.example apps/admin/.env
cp .env.example apps/student/.env
# Edit both .env files with your Supabase URL, anon key, and Mapbox token
```

### Environment variables

| Variable | Required by | Purpose |
|----------|------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Both apps | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Both apps | Supabase anonymous key |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Admin only | Mapbox `pk.` access token for map tiles |

Only `EXPO_PUBLIC_` prefixed variables are bundled into the JS runtime.

### Mapbox download token (admin app)

The admin app pulls the Mapbox SDK from Maven during Gradle builds. This requires a secret (`sk.`) download token.

**Local builds** -- add to `~/.gradle/gradle.properties`:

```properties
MAPBOX_DOWNLOADS_TOKEN=sk.your_mapbox_secret_token
```

**EAS cloud builds:**

```bash
eas secret:create --scope project --name MAPBOX_DOWNLOADS_TOKEN --value sk.xxx
```

## Development

```bash
# Run apps
just admin                # Start admin app
just student              # Start student app

# Quality checks
just check                # Typecheck all workspaces
just lint                 # ESLint across workspaces
just test                 # Jest across workspaces
just ci                   # Full gate: check + lint + test
```

### Local Supabase

```bash
just supabase-start       # Start local stack (API :54321, Studio :54323, DB :54322)
just supabase-reset       # Drop + migrate + seed
just supabase-migrate     # Apply pending migrations only
just supabase-types       # Regenerate TS types from schema
```

Studio is at `http://localhost:54323` after `supabase-start`.

## Database

PostgreSQL 17 with PostGIS. Core tables:

| Table | Purpose |
|-------|---------|
| `campuses` | Campus bounds (PostGIS polygon), security contact |
| `buildings` | Facility outlines, entrances, floor count, hours |
| `building_entrances` | Named entry points with accessibility notes |
| `routes` | Recorded paths with status lifecycle (draft > pending > published > retracted) |
| `waypoints` | Ordered points along a route: GPS coordinate, heading, text/audio annotations, photos |
| `hazards` | Marked obstacles (steps, doors, crossings, surface changes) with severity |
| `pois` | Points of interest (security office, nurse station) |
| `profiles` | Extended auth.users with role (admin/volunteer/student) and campus association |
| `activity_log` | Audit trail for login events, route publishes, role changes |

RLS policies scope access by role. Students read published routes. Admins have full CRUD. Anonymous users get limited read access for route previews.

### Edge Functions

| Function | Purpose |
|----------|---------|
| `auth-webhook` | Receives Supabase Auth events, writes audit log |
| `update-user-role` | Admin endpoint to change user roles |
| `deactivate-user` | Soft-delete user and associated data |
| `invite-user` | Generate invite codes |
| `purge-orphaned-storage` | Cleanup unreferenced media from waypoint recordings |

## Builds

```bash
# Preview APKs (internal distribution)
eas build --platform android --profile preview-admin
eas build --platform android --profile preview-student

# Production
eas build --platform android --profile production-admin
eas build --platform android --profile production-student

# iOS
just build-admin-ios
just build-student-ios
```

## Staging Deployment

```bash
# Database migrations
supabase db push --project-ref $STAGING_PROJECT_REF

# Edge functions
supabase functions deploy --project-ref $STAGING_PROJECT_REF

# Seed data (after migrations)
psql $STAGING_DB_URL -f supabase/seed_staging.sql
```

## How It Works

**Recording (Admin):** An O&M specialist walks a route with the admin app. The app captures GPS coordinates, heading, and distance at each waypoint. The specialist adds voice annotations ("turn left at the fountain"), marks hazards, and takes reference photos. The route is saved to Supabase with a computed path geometry and content hash.

**Navigation (Student):** A student opens the app and speaks a destination. The app matches the request to a building, finds a published route, and begins turn-by-turn guidance. Navigation combines GPS positioning with pedestrian dead reckoning (accelerometer + gyroscope) for continuity when GPS drops between buildings. Each waypoint triggers haptic patterns that encode the turn direction, plus audio instructions from the volunteer's annotations.

**Haptic Feedback:** Four timing schemes (S1-S4) map bearing changes to distinct vibration patterns. The patterns are defined as millisecond-precision time arrays in `packages/shared/src/hapticTimings.ts`. The haptic lab in the admin app allows testing patterns on device.
