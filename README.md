# EchoEcho

AI-powered campus navigation for visually impaired students. Two-app architecture:
- **Admin app** (`apps/admin/`) — route-builder for O&M specialists and volunteers
- **Student app** (`apps/student/`) — accessible turn-by-turn navigation

## Prerequisites

- Node 20+
- Yarn 4 (`npm i -g yarn`)
- Expo CLI (`npm i -g expo-cli`)
- Android Studio + Android SDK (for Android builds)
- JDK 17

## First-time setup

```bash
# Install all workspace dependencies
yarn install

# Copy env files (gitignored — must be done once per machine)
cp .env.staging apps/student/.env
cp .env.staging apps/admin/.env
```

The `apps/student/.env` and `apps/admin/.env` files are gitignored. They contain
`EXPO_PUBLIC_*` variables that Expo reads at bundle time. Only EXPO_PUBLIC_ prefixed
variables are included in the JS bundle; CI-only keys in `.env.staging` are ignored.

## Mapbox token setup (admin app)

The admin app uses `@rnmapbox/maps` which requires two separate tokens:

| Token | Purpose | Where it goes |
|-------|---------|---------------|
| `sk.` download token | Pulls Mapbox SDK from Maven during Gradle build | `~/.gradle/gradle.properties` |
| `pk.` access token | Authenticates map tile requests at runtime | `EXPO_PUBLIC_MAPBOX_TOKEN` in `.env` |

### Local Android builds

Add to `~/.gradle/gradle.properties` (create if missing):

```properties
MAPBOX_DOWNLOADS_TOKEN=sk.your_mapbox_secret_token_here
```

The `apps/admin/app.json` plugin sets `RNMapboxMapsDownloadToken: ""` which signals the
Mapbox Gradle plugin to fall back to `~/.gradle/gradle.properties`.

### EAS cloud builds

```bash
eas secret:create --scope project --name MAPBOX_DOWNLOADS_TOKEN --value sk.xxx
```

The Mapbox Gradle plugin reads `MAPBOX_DOWNLOADS_TOKEN` from the environment during EAS builds.

## Running on Android device

### Student app

```bash
cd apps/student
npx expo run:android
```

### Admin app

```bash
cd apps/admin
npx expo run:android
```

Ensure `MAPBOX_DOWNLOADS_TOKEN` is in `~/.gradle/gradle.properties` before running the admin build.

## Monorepo structure

```
echoecho/
  apps/
    admin/       @echoecho/admin — Expo Router app
    student/     @echoecho/student — Expo Router app
  packages/
    shared/      @echoecho/shared — types, utils, Supabase client
    ui/          @echoecho/ui — shared UI components (admin only)
  supabase/      Edge Functions + migrations
```

Shared packages are resolved via Babel `module-resolver` aliases pointing directly
to the TypeScript source. Metro `watchFolders` includes the workspace root so Metro
can hot-reload changes in `packages/` without publishing.

## EAS builds

```bash
# Admin preview APK
eas build --platform android --profile preview-admin

# Student preview APK
eas build --platform android --profile preview-student
```

## Supabase

```bash
# Apply migrations
supabase db push --project-ref drbcraxnnbpjlkbqtbfa

# Deploy edge functions
supabase functions deploy --project-ref drbcraxnnbpjlkbqtbfa
```
