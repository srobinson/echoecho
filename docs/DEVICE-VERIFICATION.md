# EchoEcho Device Verification Guide

Step-by-step instructions for verifying Supabase and Mapbox integration on a physical Android device. Covers ALP-1000 through ALP-1003.

## Global Prerequisites

1. **Android device** connected via USB with developer mode enabled
2. **Supabase staging instance** (`drbcraxnnbpjlkbqtbfa`) with all migrations applied
3. **Environment files** in place:
   - `apps/admin/.env` and `apps/student/.env` with:
     ```
     EXPO_PUBLIC_SUPABASE_URL=https://drbcraxnnbpjlkbqtbfa.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
     ```
   - `apps/admin/.env` also needs:
     ```
     EXPO_PUBLIC_MAPBOX_TOKEN=pk.<your public token>
     ```
4. **Mapbox download token** in `~/.gradle/gradle.properties`:
   ```
   MAPBOX_DOWNLOADS_TOKEN=sk.<your secret token>
   ```
5. **Migrations applied** including migration 007 (missing tables):
   ```bash
   supabase db push --project-ref $STAGING_PROJECT_REF
   ```

## Pre-verification: Seed Staging Data

Before verifying data queries (ALP-1001) or student E2E (ALP-1003), staging needs test data.

### Step 1: Create a test user

1. Build and run the admin app on device (see build steps below)
2. On the login screen, you cannot self-register (no sign-up UI). Create a user via the **Supabase Dashboard**:
   - Go to Authentication > Users > Add User
   - Email: `test@echoecho.dev`, Password: `TestPass123!`
   - The `handle_new_user` trigger (migration 001) auto-creates a profile row with role `volunteer`

### Step 2: Promote to admin

In the Supabase SQL Editor, run:
```sql
UPDATE profiles
SET role = 'admin', campus_id = '00000000-0000-0000-0000-000000000001'
WHERE id = (SELECT id FROM auth.users WHERE email = 'test@echoecho.dev');
```

### Step 3: Run the staging seed

The seed script requires at least one `auth.users` row (the test user above). Run via SQL Editor or psql:

```sql
-- Copy contents of supabase/seed_staging.sql and execute
```

The seed inserts:
- 1 campus (TSBVI) with security phone
- 3 buildings (Main Building, Gymnasium, Student Center) with entrances
- 2 published routes with waypoints (Main→Gym, Main→Student Center)
- 1 hazard on Route 1
- 1 POI (security office)

### Step 4: Build and install

```bash
# Admin app
cd apps/admin
npx expo prebuild --clean
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk

# Student app
cd apps/student
npx expo prebuild --clean
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## ALP-1000: Verify Supabase Auth Flow on Device

**What we are testing**: Admin app sign-in, session persistence, profile fetch, token refresh, sign-out.

### Test 1: Sign In

1. Open the admin app
2. You should see the login screen (dark background, "EchoEcho Admin" heading)
3. Enter `test@echoecho.dev` / `TestPass123!`
4. Tap "Sign In"

**Expected**: The app navigates to the Map tab. The Supabase dashboard (Authentication > Users) should show a `last_sign_in_at` timestamp for the test user.

**If it fails**:
- "Invalid login credentials": user was not created, or password is wrong
- Network error: check `EXPO_PUBLIC_SUPABASE_URL` in `.env`
- App hangs on splash: the `getSession()` call in `useAuth.ts` may be failing silently. Check adb logcat for errors.

### Test 2: Session Persistence

1. After successful sign-in, force-close the app (swipe away from recents)
2. Reopen the app

**Expected**: App goes directly to the Map tab without showing the login screen. The session is restored from AsyncStorage.

**If it fails**: Check that `@react-native-async-storage/async-storage` is installed and linked. The storage key is `echoecho-admin-session`.

### Test 3: Profile Fetch and RLS

1. While signed in, the app should have loaded your profile
2. The profile query (`profiles` table with RLS) should return role = `admin`

**Expected**: No error state visible. The settings tab should eventually show your campus name.

**How to confirm**: In Supabase dashboard, go to Table Editor > profiles. The row for your user should have `role = admin` and `campus_id` pointing to the TSBVI campus.

### Test 4: Token Refresh

1. Stay signed in for 60+ minutes, or manually expire the session via Supabase dashboard
2. Return to the app

**Expected**: The Supabase JS client auto-refreshes the token. No sign-out occurs. If the token is expired and refresh fails, the app should redirect to login.

### Test 5: Sign Out

1. Go to the Settings tab
2. Tap "Sign Out"

**Expected**: Confirmation dialog appears. After confirming, the app redirects to the login screen. The session is cleared from AsyncStorage.

---

## ALP-1001: Verify Supabase Data Queries Return Real Data

**What we are testing**: Querying buildings, routes, waypoints, building_entrances, hazards from staging.

### Prerequisites

- Staging seed data applied (see "Pre-verification" above)
- Signed in as the admin test user

### Test 1: Map Tab Data Load

1. Open the admin app and sign in
2. Navigate to the Map tab (first tab)

**Expected**: The map should render (Mapbox, covered in ALP-1002). The data hook `useAdminMapData` queries:
- `buildings` table with `building_entrances(*)` join
- `routes` table with `waypoints(*)` and `hazards(*)` joins

**What to look for**:
- If building polygons appear as blue shapes on the map: buildings query works
- If colored polylines appear: routes query works
- If POI markers appear at waypoint locations: waypoints query works

**If nothing loads and map is empty**: Open adb logcat and filter for "supabase" or JavaScript errors. Common cause:
- The campus store auto-initializes from Supabase after auth (see `_layout.tsx`). If the campuses query returns no rows, `activeCampus` stays null and data queries return nothing. Verify seed data exists.

### Test 2: Routes List Tab

1. Tap the "Routes" tab (second tab)

**Expected**: Two route cards should appear:
- "Main Building to Gymnasium" (published, 5 waypoints, ~160m)
- "Main Building to Student Center" (published, 4 waypoints, ~100m)

**If the list is empty**: The `routeStore` is not being populated from Supabase. Check whether any screen or hook calls `setRoutes()`. Currently `routeStore` is a passive Zustand store with no fetch logic wired. This is a gap for the next worker.

### Test 3: Buildings Query (SQL Editor check)

Verify in the Supabase SQL Editor that the queries match what the app expects:

```sql
-- What useAdminMapData queries
SELECT b.*, be.*
FROM buildings b
LEFT JOIN building_entrances be ON be.building_id = b.id
WHERE b.campus_id = '00000000-0000-0000-0000-000000000001';

-- What it also queries
SELECT r.*, w.*, h.*
FROM routes r
LEFT JOIN waypoints w ON w.route_id = r.id
LEFT JOIN hazards h ON h.route_id = r.id
WHERE r.campus_id = '00000000-0000-0000-0000-000000000001'
  AND r.status IN ('draft', 'published');
```

Both should return data if the seed was applied.

---

## ALP-1002: Verify Mapbox Renders Tiles and Layers

**What we are testing**: Mapbox SDK initialization, satellite tile loading, custom layer rendering.

### Prerequisites

- `EXPO_PUBLIC_MAPBOX_TOKEN` (pk. token) in `apps/admin/.env`
- `MAPBOX_DOWNLOADS_TOKEN` (sk. token) in `~/.gradle/gradle.properties`
- Successful Android build (Mapbox SDK compiles via native Gradle module)

### Test 1: Map Renders

1. Open admin app, sign in, go to Map tab

**Expected**: A satellite imagery map centered on TSBVI campus (30.3495, -97.7468) at zoom level 16. You should see:
- Satellite aerial imagery
- Road and label overlays (satellite-streets-v12 style)

**If map is blank/grey**:
- Invalid or missing `EXPO_PUBLIC_MAPBOX_TOKEN`: check `.env`. Must be a `pk.` token (public), not `sk.`
- Token not authorized: go to Mapbox dashboard > Tokens. The token needs `styles:read` and `styles:tiles` scopes at minimum
- Network: ensure device has internet access

**If build fails with "Could not resolve com.mapbox.maps"**:
- Missing `MAPBOX_DOWNLOADS_TOKEN` in `~/.gradle/gradle.properties`
- Token must be `sk.` (secret). This is the Gradle download token, separate from the runtime token.

### Test 2: Building Polygons Layer

1. With data loaded (seed applied), building outlines should render as shaded polygons

**Expected**: Three blue/purple polygon shapes at the locations of Main Building, Gymnasium, and Student Center.

**If no polygons**: The `BuildingLayer` component reads from `useAdminMapData` which depends on `activeCampus`. See the note in ALP-1001 Test 1 about campus store initialization.

### Test 3: Route Polylines Layer

1. Route paths should render as colored lines on the map

**Expected**: Two polylines connecting Main Building to Gymnasium and Main Building to Student Center. Published routes render in green; draft routes in orange.

### Test 4: Layer Toggle

1. Tap the layer control (top-right corner of map)
2. Toggle buildings, routes, and waypoints on/off

**Expected**: Each layer appears and disappears independently.

---

## ALP-1003: Student App End-to-End

**What we are testing**: Full flow from route loading through navigation activation.

### Prerequisites

- Staging seed data applied
- Student app built and installed
- A student profile exists. Create via SQL Editor:
  ```sql
  -- Create a student user via Supabase Auth dashboard first, then:
  UPDATE profiles
  SET role = 'student', campus_id = '00000000-0000-0000-0000-000000000001'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'student@echoecho.dev');
  ```

### Test 1: App Launch and Campus Load

1. Open the student app

**Expected**: Home screen with "EchoEcho" heading and "Where do you want to go?" tagline. The `CampusProvider` loads campus data from Supabase in the background.

**If crash on launch**: Check adb logcat. Common cause: missing `@react-native-async-storage/async-storage` or `expo-sqlite`.

### Test 2: Route Sync

The student app syncs published routes to local SQLite via `syncEngine.ts`. This happens on:
- App foreground resume (throttled to 15 min)

The sync engine queries `routes` and `waypoints` tables. To verify:

1. After app launch, wait a few seconds
2. The sync should complete silently

**How to confirm**: In adb logcat, look for `[syncEngine]` log messages. Absence of error messages means success.

### Test 3: Voice Destination Input

1. Tap the large "Speak Destination" button
2. Say "Gymnasium"

**Expected**: The STT engine transcribes your speech, fuzzy-matches against the building index, and either:
- Shows a confirmation prompt ("Navigate to Gymnasium?")
- Shows disambiguation if multiple matches

**If STT is unavailable**: The button label changes to show keyboard fallback is available. On first run, the building index is empty (bundled fallback is `[]`). It populates after the first sync cycle updates AsyncStorage.

### Test 4: Navigation Start

1. From favorites or voice input, select a route
2. The app navigates to `/navigate/[routeId]`

**Expected**:
- Navigation screen appears with status "Finding position..."
- GPS tracking starts (location permission prompt if first time)
- Once GPS lock is acquired, status changes to "Navigating"
- Current instruction shows the first waypoint annotation
- Progress bar shows "Waypoint 1 of N"

**If "Finding position..." never resolves**: GPS signal unavailable indoors. Test outdoors or use a mock location provider.

**If no waypoints load**: The navigation screen calls `getOrderedWaypoints(routeId)` from local SQLite. If sync did not complete, the local DB is empty. Check sync status first.

### Test 5: Haptic and Audio Feedback

1. During active navigation, approach a waypoint location

**Expected**:
- Haptic vibration pattern fires as you approach (if device supports it and Low Power Mode is off)
- TTS announcement of the waypoint's annotation text
- Turn instruction updates based on heading change

### Test 6: End Navigation

1. Tap "End Navigation" button at bottom

**Expected**: Returns to home screen. Navigation session is cleared.

---

## Resolved Gaps

All previously identified code gaps have been fixed:

1. **Route store population** (iter23): `RoutesScreen` now fetches routes from Supabase
   on mount when `activeCampus` is set, using the same query pattern as `useAdminMapData`.

2. **Student app auth** (iter23): The student app now calls `signInAnonymously()` on
   launch (in `_layout.tsx`). Migration 008 adds RLS policies granting any authenticated
   user (including anonymous) read access to published campuses, buildings, entrances,
   routes, waypoints, hazards, and POIs.

**Migration 008 must be applied before student app device testing:**
```bash
supabase db push --project-ref $STAGING_PROJECT_REF
```

**Supabase project setting required:** Anonymous sign-in must be enabled in the
Supabase dashboard under Authentication > Providers > Anonymous Sign-Ins.

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| App crashes on launch | Missing native module | Run `npx expo prebuild --clean` and rebuild |
| "Network request failed" | Wrong Supabase URL | Check `.env` file has correct URL without trailing slash |
| Map is grey/blank | Invalid Mapbox pk token | Verify token in Mapbox dashboard, check scopes |
| Build fails on Mapbox | Missing sk download token | Add to `~/.gradle/gradle.properties` |
| RLS error 401/403 | Profile role not set | Run the SQL to set role to `admin` |
| "relation building_entrances does not exist" | Migration 007 not applied | Run `supabase db push` |
| Student app gets no data | Anonymous sign-in disabled | Enable in Supabase dashboard; apply migration 008 |
