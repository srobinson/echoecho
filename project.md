# EchoEcho Project Notes

## Purpose

EchoEcho is a monorepo for two Expo/React Native apps backed by Supabase:

- `apps/admin`: admin/operations app for campus setup, buildings, hazards, and route authoring
- `apps/student`: student navigation app for destination search, local/offline route sync, and turn-by-turn guidance
- `packages/shared`: shared TypeScript contracts and geo utilities used by both apps

The repo uses Yarn workspaces and Turbo.

## Product Notes

Two focused product docs now live under `docs/`:

- `docs/route-authoring-proposal.md`
- `docs/route-domain-model.md`
- `docs/interior-mapping-proposal.md`
- `docs/interior-domain-model.md`
- `docs/spec-router-admin-app-split.md`
- `docs/permission-matrix-current-roles.md`
- `docs/user-management-spec.md`
- `docs/web-admin-v1-surface.md`

Current working product direction:

- `student` is the end user who consumes published routes
- `volunteer` is the primary field/content role that proposes and walks routes
- `om_specialist` is the elevated operational author role
- `admin` is the governance role that manages campuses/buildings and publishes reviewed routes

Product split guidance:

- split responsibilities and permissions before splitting codebases
- treat the current mobile admin app as the temporary home of router workflows plus some embedded admin controls
- plan for long-term separation into `router mobile` and `admin web`

Important: point-and-click route creation should produce a draft route, not a publishable route. Publishable routes should remain tied to a walked and reviewed workflow.

Operational role names currently remain:

- `admin`
- `om_specialist`
- `volunteer`
- `student`

Current working interpretation:

- `student` is anonymous-first
- `volunteer` is the field router role
- `om_specialist` is the elevated operational author role
- `admin` is the governance role

Indoor-mapping direction is now also captured:

- interiors should be treated as floor-aware navigation graphs
- structural interior authoring should be web-first
- router/mobile should validate indoor route truth in the field

## High-value Commands

- `yarn workspace @echoecho/admin typecheck`
- `yarn workspace @echoecho/student typecheck`
- `yarn workspace @echoecho/admin test -- campusDetection`
- `yarn workspace @echoecho/student test -- campusDetection`
- `just supabase-seed-staging`

## Spatial Model

### Campuses

Campuses now have three distinct spatial representations:

- `location`: point geometry used as a reference center
- `bounds`: polygon geometry in Postgres
- `footprint`: polygon ring exposed through `v_campuses` for app use

Important: app behavior should prefer `footprint` for real geometry decisions, not `center`.

### Campus Creation

Campus creation is boundary-first, not point-first.

- Admins draw a polygon in `apps/admin/app/campus-boundary.tsx`
- The backend stores the polygon and derives `location` from its centroid
- The relevant RPCs are:
  - `create_campus_with_bounds`
  - `create_bootstrap_campus_with_bounds`
  - `replace_campus_bounds`

### Campus Detection

Student detection now uses the actual campus polygon footprint.

- `apps/student/src/lib/campusDetection.ts`
- It performs point-in-polygon first
- It falls back to bounding-box logic only if a footprint is missing
- The prior center-point-only bug is fixed

Admin detection currently uses campus selection utilities under:

- `apps/admin/src/lib/campusDetection.ts`
- `apps/admin/src/hooks/useCampusDetection.ts`

If future work touches campus selection again, keep admin and student logic aligned.

## Map Behavior

### Admin Main Map

The admin main map:

- renders the campus boundary as a base context layer
- fits to the campus boundary on first entry or when switching campuses
- preserves the user’s viewport for the currently active campus after that

This behavior depends on `apps/admin/src/stores/mapViewportStore.ts`, which now stores:

- `campusId`
- `center`
- `zoom`

### Route Maps

Admin route preview/detail maps now:

- render the campus boundary
- fit the camera to the campus footprint when available

This is handled in `apps/admin/src/components/route/RoutePreviewMap.tsx`.

## Campus Deletion Semantics

Campus deletion is intended to be a real delete, not a soft hide.

Current rule:

- deleting a campus should delete linked buildings, routes, hazards, and POIs
- deleting a campus should **not** delete user profiles
- instead, `profiles.campus_id` should be set to `NULL`

In the consolidated baseline:

- `buildings.campus_id` -> `ON DELETE CASCADE`
- `routes.campus_id` -> `ON DELETE CASCADE`
- `hazards.campus_id` -> `ON DELETE CASCADE`
- `pois.campus_id` -> `ON DELETE CASCADE`
- `profiles.campus_id` -> `ON DELETE SET NULL`

The admin app still calls the RPC named `soft_delete_campus`, but the intended behavior is now hard delete.

## Supabase / Migration Policy

The repo has been consolidated to a single baseline migration:

- `supabase/migrations/20260310000001_baseline.sql`

Older incremental migration files and historical down-migration clutter were removed. Future schema work should update the baseline consistently or reintroduce incremental migrations deliberately, not accidentally.

Important gotchas already resolved:

- the baseline must create `pgcrypto`, `pg_trgm`, and `postgis` explicitly
- `campuses.location` is `geometry(Point,4326)`, not `geography`
- `v_campuses` includes `footprint`; if modified later, avoid accidental column reordering

## Linked Remote Project

The linked Supabase project ref used in this repo is:

- `drbcraxnnbpjlkbqtbfa`

The remote has been reset and aligned to the consolidated baseline during this workstream.

## Seeding / Staging Workflow

`just supabase-seed-staging` is now intended for lightweight auth/bootstrap support, not full campus fixture loading.

Behavior:

- recreates seeded auth users
- upserts matching `public.profiles`
- skips SQL cleanup if `STAGING_DB_URL` is not set
- can infer the project ref from:
  - `STAGING_PROJECT_REF`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `supabase/.temp/project-ref`

Current seeded users:

- `seed-admin@echoecho.test`
- `seed-student@echoecho.test`

Do not store `SUPABASE_SERVICE_ROLE_KEY` in app runtime env files unless there is a deliberate secure local-only workflow for it.

## Settings Menu UI Note

The settings campus context menu can be affected by stacking order. If menu items appear hidden behind lower sections, check z-index/elevation on the entire `Campuses` section, not only the menu itself.

## Recommended Future Discipline

- Prefer real polygon geometry over center-point assumptions
- Keep admin and student campus-selection logic behaviorally aligned
- Treat `project.md` as the first place to record repo-specific operational knowledge after major fixes
- If a future session changes staging workflow, seed behavior, or migration policy, update this file immediately
