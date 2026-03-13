# Current-Roles Auth Model Spec

Date: 2026-03-13

## Purpose

Map the current role/auth/schema model against the product split while keeping the current role names:

- `student`
- `volunteer`
- `om_specialist`
- `admin`

This note identifies the concrete auth and permission changes needed without renaming roles.

## Current Model

The current role system is still built around:

- `admin`
- `om_specialist`
- `volunteer`
- `student`

### Canonical Sources

Current role definitions live in:

- [packages/shared/src/types/user.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/packages/shared/src/types/user.ts)
- [supabase/migrations/20260310000001_baseline.sql](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/migrations/20260310000001_baseline.sql)
- [apps/admin/src/stores/authStore.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/src/stores/authStore.ts)
- [supabase/functions/invite-user/index.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/invite-user/index.ts)
- [supabase/functions/update-user-role/index.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/update-user-role/index.ts)
- [supabase/functions/deactivate-user/index.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/deactivate-user/index.ts)

## Current Problems

### 1. Permission boundaries are not explicit enough

`volunteer` is the primary field-routing role.

`om_specialist` is the elevated operational-author role.

### 2. Auth defaults are wrong for the new model

`handle_new_user()` currently inserts new users as `volunteer`.

That means every fresh authenticated user defaults into a content-authoring role.

For the current product direction, that is too permissive. New users should not silently become operational authors.

### 3. Admin app assumes any non-student operational role is “admin access”

[authStore.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/src/stores/authStore.ts) only checks whether a profile exists and then stores `AdminUser`.

The error copy says `This account does not have admin access.`, but the accepted roles in shared types are:

- `admin`
- `om_specialist`
- `volunteer`

So the current app is really “operations access,” not true admin access.

### 4. RLS is hard-coded to legacy role buckets

The baseline includes many policies and helper functions using explicit arrays like:

- `('admin', 'om_specialist', 'volunteer')`
- `('admin', 'om_specialist')`
- `('admin')`

This means the role split is not just a UI change. It is a schema and authorization refactor.

### 5. Edge functions are hard-coded to legacy roles

`invite-user` only allows inviting:

- `om_specialist`
- `volunteer`

`update-user-role` allows:

- `admin`
- `om_specialist`
- `volunteer`
- `student`

Those APIs need to be realigned to the new role vocabulary.

## Recommended Target Model

Recommended application-level interpretation:

- `student`: anonymous-first end user
- `volunteer`: primary field router / route recorder
- `om_specialist`: elevated operational author
- `admin`: governance role

## Recommended Migration Strategy

Do this in two phases.

### Phase 1: Clarify permissions without renaming roles

Goal:

- keep the existing role names
- define explicit capabilities for `volunteer`, `om_specialist`, and `admin`
- align auth defaults and copy with anonymous-first students

Recommended concrete changes:

1. Update shared types
- keep `UserRole` names as-is
- clarify product meaning in docs and UI copy

2. Keep `profiles.role` constraint
- no rename required at this stage

3. Data migration
- no role rename migration required at this stage

4. Update auth bootstrap behavior
- `handle_new_user()` should no longer default to `volunteer`
- preferred default is a minimally privileged/anonymous student path, unless signup flows are fully separated by app

5. Update edge-function validation lists
- `invite-user`
- `update-user-role`
- any admin tooling that validates explicit role strings

6. Update admin-app copy and assumptions
- stop conflating “has access to operations app” with “is admin”

### Phase 2: Split permissions by capability

Goal:

- make `volunteer`, `om_specialist`, and `admin` meaningfully different in RLS and product behavior

Recommended permission model:

- `student`
  - anonymous-first
  - read published student content only

- `volunteer`
  - create and edit draft route content in scoped ways
  - walk and submit routes
  - read relevant campus/building/hazard data
  - should not publish
  - should not manage campus/building governance

- `om_specialist`
  - all volunteer capabilities
  - broader authoring/editing rights
  - may help review/prepare content
  - should not be the final publishing authority

- `admin`
  - full governance
  - campus/building/entrance management
  - invite/deactivate/update roles
  - review/publish/archive routes

## Concrete Schema/Auth Changes

### Profiles

Keep:

- `profiles.role` constraint values

Change:

- product semantics and downstream permission logic

### Helper Functions

Current helper functions:

- `current_user_role()`
- `current_user_campus()`

These can remain structurally the same, but every downstream policy using explicit role arrays must be updated.

### New-user bootstrap

Change:

- `handle_new_user()` default role

Current:

- inserts `volunteer`

Recommended:

- default to `student`

Reason:

- safer default
- avoids silently granting authoring power
- better aligned with multi-app product separation

If operational onboarding needs different defaults, that should happen through invite/bootstrap flows, not the generic auth trigger.

### Edge Functions

#### invite-user

Keep:

- `om_specialist`
- `volunteer`

Optional later:

- `student`, only if authenticated students become a real requirement

#### update-user-role

Change:

- replace legacy allowed list with target roles
- update audit log metadata accordingly

#### deactivate-user

No major logic change needed.

But any role wording in responses or surrounding UI should align to the current chosen vocabulary.

## Concrete RLS Changes

The biggest implementation work is RLS.

### What should belong to `volunteer`

Volunteers should likely retain read access to:

- campuses
- buildings
- building entrances
- hazards
- POIs
- routes
- waypoints

But write access should be narrowed to route-authoring surfaces, not governance surfaces.

### What should remain `admin` only

Admin-only writes should include:

- campuses insert/update/delete
- buildings insert/update/delete
- building entrances insert/update/delete
- POIs insert/update/delete
- user/role management
- route publish/retract/review governance

### Biggest current mismatch

Today, `volunteer` is still included in route and waypoint authoring policies, while `om_specialist` can do even more. That is effectively the intended operational-authoring space.

So the clean move is:

- keep `volunteer` as the field role
- explicitly define which additional powers belong to `om_specialist`
- move governance-only powers to `admin`

## Admin App Assumptions To Fix

[authStore.ts](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/apps/admin/src/stores/authStore.ts) currently types the profile as `AdminUser` and shows the error:

- `This account does not have admin access.`

That is too coarse for the new model.

Recommended:

- rename this operational profile type to something neutral such as `OperatorUser`
- gate true admin-only screens/actions separately
- reserve “admin” wording for the actual governance role

## Recommended Rollout Order

1. Finalize the target role meanings:
- `student`
- `volunteer`
- `om_specialist`
- `admin`

2. Add product-facing docs and permission matrix.

3. Update shared types and edge-function role validation.

4. Migrate `profiles.role` values and constraints.

5. Update RLS policies systematically.

6. Update app auth assumptions and copy.

7. Split UI surfaces:
- volunteer / `om_specialist` mobile
- admin web
- shared/draft authoring where appropriate

## Recommendation

Yes, splitting the current “admin” world into clearer operational and governance capabilities should happen before major new workflow work.

But do not start with UI splitting alone.

Start with:

- permission boundaries
- `profiles.role` semantics
- RLS policy buckets
- edge-function role validation
- admin-auth assumptions

Once those are defined cleanly, the app split becomes much less ambiguous.
