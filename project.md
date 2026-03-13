# EchoEcho Project Notes

## Purpose

EchoEcho is a VI (visually impaired) spatial awareness platform for campus navigation. The student says "Take me to Room 312" from anywhere on campus, and the system routes them there: outdoors via Mapbox walking directions, through the best building entrance, then indoors via a pre-authored navigation graph.

The repo is a monorepo for two Expo/React Native apps backed by Supabase:

- `apps/admin`: campus setup, buildings, hazards, indoor graph authoring, route governance
- `apps/student`: voice-first navigation, real-time routing, turn-by-turn guidance, offline-capable
- `packages/shared`: shared TypeScript contracts and geo utilities

The repo uses Yarn workspaces and Turbo.

## Product Vision

### Real-Time Three-Segment Routing

Navigation is computed on demand from the student's current position to any room in any building. No pre-authored route required.

1. **Outdoor**: Mapbox Directions API (`mapbox/walking`, `walkway_bias: 1`). Campus pedestrian paths are already mapped in OSM. GPS positioning. Phone in pocket.
2. **Transition**: BLE beacons at building entrances create a GPS-to-BLE overlap zone. The `outdoor_indoor_connector` entity is the handoff point.
3. **Indoor**: A* on the `indoor_node` / `indoor_edge` graph. BLE + IMU positioning (2-3m accuracy). Voronoi-weighted corridor centerline routing.

EchoEcho only maps indoors. Outdoors is free infrastructure via Mapbox/OSM.

### Mapbox Navigation SDK for React Native (OSS)

No official React Native wrapper for the Mapbox Navigation SDK exists. Helioy will build and open-source one. This fills a real gap in the ecosystem (the most requested missing piece for @rnmapbox/maps) and gives EchoEcho native turn-by-turn walking navigation with offline routing and automatic rerouting.

The native SDK already supports walking alongside driving and cycling. The wrapper exposes:

- Walking turn-by-turn navigation with voice instructions
- Offline route calculation via downloadable navigation tiles
- Automatic rerouting on deviation
- Route progress tracking and ETA updates
- Accessibility-aware audio guidance hooks

Scope is deliberately narrow: walking navigation for accessibility. Not a full driving navigation UI. This keeps the surface area manageable and the library focused.

Target repo: `helioy/react-native-mapbox-navigation` (or contributed upstream to `@rnmapbox`).

### Pre-Authored Routes Are Curated Experiences

Pre-authored routes do not drive the navigation infrastructure. They are content:

- orientation day walkthroughs
- accessible-only paths (pre-validated, avoiding all stairs and heavy doors)
- scenic or preferred paths (landmark-rich, socially comfortable)
- emergency evacuation routes

The infrastructure is the indoor graph + entrance connectors + Mapbox.

### Phased Platform

| Phase | What Ships | Hardware |
|-------|-----------|----------|
| 1 | Real-time routing + indoor graph + BLE positioning + audio turn-by-turn | Phone only |
| 2 | + obstacle detection + on-demand scene description via smart glasses | Phone + Ray-Ban Meta ($299) |
| 3 | + temporal memory + cross-visit recognition + on-device VLM | Same |
| 4 | Multi-campus platform with crowd-sourced graph refinement | Expanding glasses support |

Phase 1 alone addresses the killer gap. Full research at `~/.mdx/research/echoecho-vi-spatial-awareness-platform.md`.

### Voice-First Interaction

- "Take me to Room 312" - full three-segment route
- "Find the nearest restroom" - query by destination type
- "Where am I?" - position described relative to graph context
- "What's nearby?" - destinations within radius on current floor
- "What's around me?" - cloud VLM scene description (Phase 2+)

## Roles

- `student`: anonymous-first, consumes published navigation
- `volunteer`: field router role, validates indoor graphs and captures landmarks/hazards
- `om_specialist`: elevated operational author, proposes and walks routes
- `admin`: governance role, manages campuses/buildings, publishes reviewed content

Product split guidance:

- split responsibilities and permissions before splitting codebases
- treat the current mobile admin app as the temporary home of router workflows
- plan for long-term separation into `router mobile` and `admin web`

## Indoor Domain Model

Full spec at `docs/interior-domain-model.md`. Core entities:

- `building`, `level`, `destination`
- `indoor_node`, `indoor_edge` (the navigation graph)
- `vertical_connector` (elevator, stairs, ramp)
- `outdoor_indoor_connector` (building entrance, the outdoor-to-indoor handoff)
- `landmark`, `hazard`

The `outdoor_indoor_connector` needs: GPS coordinates (for Mapbox routing target), accessibility attributes, access hours, card-access flag, floor level, and an attached `indoor_node`.

Indoor data follows three truth levels:

1. `structural_draft`: web-authored baseline, not yet trusted
2. `field_validated`: volunteer confirmed in the real building
3. `published`: admin approved for student use

Do not collapse these. A floorplan draft, a validated graph, and a published route are different things.

## Product Docs

- `docs/route-authoring-proposal.md`
- `docs/route-domain-model.md`
- `docs/interior-mapping-proposal.md`
- `docs/interior-domain-model.md`
- `docs/spec-router-admin-app-split.md`
- `docs/spec-router-admin-auth-model.md`
- `docs/spec-router-admin-route-lifecycle.md`
- `docs/permission-matrix-current-roles.md`
- `docs/user-management-spec.md`
- `docs/web-admin-v1-surface.md`

## Known Blockers

**ALP-1055**: hazards, POIs, and building_entrances store coordinates as JSONB instead of PostGIS geometry. This makes spatial queries impossible. Must be resolved before indoor mapping adds more spatial data.

## High-Value Commands

- `yarn workspace @echoecho/admin typecheck`
- `yarn workspace @echoecho/student typecheck`
- `yarn workspace @echoecho/admin test -- campusDetection`
- `yarn workspace @echoecho/student test -- campusDetection`
- `just supabase-seed-staging`

## Spatial Model

### Campuses

Three distinct spatial representations:

- `location`: point geometry used as a reference center
- `bounds`: polygon geometry in Postgres
- `footprint`: polygon ring exposed through `v_campuses` for app use

App behavior should prefer `footprint` for real geometry decisions, not `center`.

### Campus Creation

Campus creation is boundary-first, not point-first.

- Admins draw a polygon in `apps/admin/app/campus-boundary.tsx`
- The backend stores the polygon and derives `location` from its centroid
- RPCs: `create_campus_with_bounds`, `create_bootstrap_campus_with_bounds`, `replace_campus_bounds`

### Campus Detection

Student detection uses the actual campus polygon footprint.

- `apps/student/src/lib/campusDetection.ts`
- Point-in-polygon first, bounding-box fallback if footprint is missing

Admin detection:

- `apps/admin/src/lib/campusDetection.ts`
- `apps/admin/src/hooks/useCampusDetection.ts`

Keep admin and student campus-selection logic aligned.

## Map Behavior

Admin main map renders the campus boundary as a base context layer, fits to boundary on first entry or campus switch, then preserves the user's viewport. Depends on `apps/admin/src/stores/mapViewportStore.ts` (campusId, center, zoom).

Route preview/detail maps render the campus boundary and fit to the footprint. Handled in `apps/admin/src/components/route/RoutePreviewMap.tsx`.

## Campus Deletion Semantics

Campus deletion is a real delete, not a soft hide.

- `buildings.campus_id` -> `ON DELETE CASCADE`
- `routes.campus_id` -> `ON DELETE CASCADE`
- `hazards.campus_id` -> `ON DELETE CASCADE`
- `pois.campus_id` -> `ON DELETE CASCADE`
- `profiles.campus_id` -> `ON DELETE SET NULL`

The admin app still calls the RPC named `soft_delete_campus`, but the intended behavior is now hard delete.

## Supabase / Migration Policy

Consolidated to a single baseline migration: `supabase/migrations/20260310000001_baseline.sql`

Future schema work should update the baseline consistently or reintroduce incremental migrations deliberately.

Gotchas:

- baseline must create `pgcrypto`, `pg_trgm`, and `postgis` explicitly
- `campuses.location` is `geometry(Point,4326)`, not `geography`
- `v_campuses` includes `footprint`; avoid accidental column reordering

## Linked Remote Project

Supabase project ref: `drbcraxnnbpjlkbqtbfa`

The remote has been reset and aligned to the consolidated baseline.

## Seeding / Staging Workflow

`just supabase-seed-staging` is lightweight auth/bootstrap support, not full campus fixture loading.

- recreates seeded auth users
- upserts matching `public.profiles`
- skips SQL cleanup if `STAGING_DB_URL` is not set
- infers project ref from `STAGING_PROJECT_REF`, `EXPO_PUBLIC_SUPABASE_URL`, or `supabase/.temp/project-ref`

Seeded users: `seed-admin@echoecho.test`, `seed-student@echoecho.test`

Do not store `SUPABASE_SERVICE_ROLE_KEY` in app runtime env files.

## Discipline

- Prefer real polygon geometry over center-point assumptions
- Keep admin and student campus-selection logic aligned
- Treat `project.md` as the first place to record repo-specific operational knowledge
- Update this file immediately when staging workflow, seed behavior, or migration policy changes
