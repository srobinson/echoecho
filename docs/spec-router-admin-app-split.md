# Operational App Split Spec

Date: 2026-03-13

## Recommendation

Do not start by immediately splitting the codebase into separate operational and admin applications.

Start by splitting the product surface and permissions model first.

That means:

1. define which workflows belong to volunteer / `om_specialist` mobile, `admin web`, `shared authoring`, and `student`
2. map those workflows onto the existing `admin` / `om_specialist` / `volunteer` / `student` roles
3. only then decide whether the operational and admin surfaces should remain one codebase with role-gated routes or become separate apps

This is the safer order because the current repo and schema still assume the older role model.

## Current Reality In The Repo

### Current roles in code and schema

The system currently uses:

- `admin`
- `om_specialist`
- `volunteer`
- `student`

This is encoded in:

- [packages/shared/src/types/user.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/packages/shared/src/types/user.ts)
- [supabase/migrations/20260310000001_baseline.sql](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/migrations/20260310000001_baseline.sql)
- [supabase/functions/invite-user/index.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/invite-user/index.ts)
- [supabase/functions/update-user-role/index.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/update-user-role/index.ts)

The admin app also assumes any signed-in profile is part of the "admin-side" surface:

- [apps/admin/src/stores/authStore.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/src/stores/authStore.ts)
- [apps/admin/src/hooks/useProtectedRoute.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/src/hooks/useProtectedRoute.ts)

### Current app surfaces

#### Student app

Current student app scope is clean:

- campus detection and local campus sync
- destination search
- route selection
- live navigation
- favorites/history
- emergency mode

This already maps well to `student` and should remain separate.

#### Current admin app

The current admin app is mixed-purpose. It contains:

- campus selection and campus creation bootstrap
- route recording in the field
- route saving and route editing
- buildings management
- hazards management
- campus settings and user/admin controls
- analytics
- main map as an all-purpose operations surface

That means today’s admin app mixes:

- volunteer / `om_specialist` field work
- content authoring
- governance
- publishing/review

## Recommended Surface Ownership

### Student

Belongs here:

- published route discovery
- destination search
- published route navigation
- emergency routing
- favorites/history

Does not belong here:

- any authoring
- any review
- any publishing

### Volunteer / OM Specialist Mobile

Belongs here:

- assigned draft route list
- route walking / recording
- waypoint, landmark, and hazard capture
- field validation of routes
- lightweight route correction during or after a walk
- submission of walked routes for review
- viewing assigned campuses/buildings/destinations needed to complete a route

Should not be the primary surface for:

- campus creation
- building/floor graph authoring
- user management
- publication/governance
- analytics-heavy operational reporting

Current repo surfaces that align most closely with the volunteer / `om_specialist` mobile surface:

- [apps/admin/app/record.tsx](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/app/record.tsx)
- [apps/admin/app/save-route.tsx](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/app/save-route.tsx)
- route detail / waypoint editing flows under `apps/admin/src/components/waypoint/`

### Admin Web

Belongs here:

- campus creation and campus boundary management
- building creation and editing
- future interior/floor/path graph authoring
- entrances, POIs, hazards governance
- route review and publish / retract
- volunteer assignment
- user invitation, role changes, activation/deactivation
- analytics and oversight

Current repo surfaces that conceptually belong to admin web:

- campus creation/bootstrap and settings
- buildings management
- hazards governance
- review/publish operations
- analytics

These are currently in the mobile admin app only because there is no web admin yet.

### Shared Authoring

Some authoring concepts should exist in both operational and admin surfaces, but with different permissions.

Shared authoring includes:

- route preview map
- draft route visualization
- route metadata
- destination/building selection
- map-based route drafting

The important distinction is not the UI widget. It is the allowed action:

- `volunteer` can propose and submit
- `om_specialist` can do broader authoring/prep
- admin can review, assign, approve, publish, and override

## Workflow Boundaries

### Campus and building structure

Owner:

- `admin web`

Includes:

- campus boundary creation/replacement
- building outlines and entrances
- future floors/interior graph

Volunteers and `om_specialist` users may view this context, but should not own the governance workflow.

### Draft route creation

Owner:

- volunteer / `om_specialist` mobile for walked-first capture
- `admin web` for map-authored drafts
- future volunteer / `om_specialist` web access for map-authored drafts if needed

This is shared authoring, but not shared publishing authority.

### Walk validation

Owner:

- volunteer / `om_specialist` mobile

This remains the critical source of route truth.

### Review and publish

Owner:

- `admin web`

This should be removed from the volunteer-facing workflow.

### Hazards

Split ownership:

- volunteers can report/create route-relevant hazards
- admin governs lifecycle, visibility, and cleanup

### Analytics

Owner:

- `admin web`

Analytics are governance tools, not volunteer field tools.

## Recommended Product Split

### Near-term

Keep the existing `apps/admin` codebase, but begin treating it as volunteer / `om_specialist` mobile with a temporary subset of admin controls still embedded.

At the same time, design the future `admin web` surface as the long-term home for:

- campus/building/interior structure
- review/publish
- user/role management
- analytics

This lets the product split happen before the repo split.

### Medium-term

Introduce role-based product surfaces:

- `student app`
- volunteer / `om_specialist` mobile app
- `admin web app`

Potentially add:

- volunteer / `om_specialist` web access as either a dedicated surface or a role-gated subset of admin web

### Long-term

Once workflows stabilize, decide whether to:

- keep operational/admin authoring in one web codebase with role-gated access
- or split into separate deployables

That decision should come after the spec and permission model settle.

## Concrete Plan

### Phase 1: Spec and permissions

- keep the current role names
- define exact permission boundaries for `volunteer`, `om_specialist`, and `admin`
- align product docs and copy to those meanings

### Phase 2: Workflow split

- define which current mobile admin screens are actually volunteer / `om_specialist` screens
- define which current mobile admin screens should move to web admin
- define the shared draft-route authoring surface

### Phase 3: Auth and schema migration plan

- update RLS, invite flow, role update flow, and shared TS contracts around the current role names
- clarify where `om_specialist` exceeds `volunteer`

### Phase 4: App delivery plan

- slim the mobile admin experience into volunteer / `om_specialist`-first workflows
- stand up admin web for governance workflows
- preserve shared route-authoring concepts across both

## Most Important Decision

Yes, the split should start now at the spec level.

But the first split should be:

- product responsibilities
- permissions
- workflow boundaries

not:

- immediate codebase fragmentation

That order will reduce churn and make the eventual app split much cleaner.
