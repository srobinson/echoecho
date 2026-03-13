# User Management Spec

Date: 2026-03-13

## Goal

Add concrete admin functionality to create and manage operational accounts.

Roles in scope:

- `admin`
- `om_specialist`
- `volunteer`

`student` is treated as anonymous-first and is not part of the core operational user-management workflow.

## Current State

Backend support already exists for:

- inviting users via [invite-user](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/invite-user/index.ts)
- changing roles via [update-user-role](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/update-user-role/index.ts)
- deactivating users via [deactivate-user](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/deactivate-user/index.ts)

What is missing:

- admin-facing UI
- user roster screen
- invite form
- role-management actions
- activation/deactivation visibility

## Product Decision

The first user-management feature should serve operational users, not students.

Primary managed account types:

- `om_specialist`
- `volunteer`

Optional later extension:

- authenticated `student` accounts, only if the product later needs managed student identity

## Core Capabilities

### 1. Invite User

Admin can:

- enter email
- choose role
- assign campus
- send invite

V1 role choices:

- `om_specialist`
- `volunteer`

Optional V1.1:

- `student`

Recommendation:

- keep V1 focused on operational accounts
- do not broaden the workflow unless there is a real authenticated-student requirement

### 2. User Roster

Admin can view:

- active users
- inactive users
- role
- assigned campus
- invited email if available
- status

Suggested filters:

- All
- Admins
- OM Specialists
- Volunteers
- Active
- Inactive

Suggested grouping:

- by campus

### 3. Change Role

Admin can:

- promote/demote between `om_specialist` and `volunteer`
- optionally promote to `admin` if that is allowed in policy

Guardrails:

- admin cannot demote themselves
- admin cannot remove the last active admin without an explicit safeguard

### 4. Deactivate User

Admin can:

- deactivate operational accounts

Behavior:

- immediately invalidate access
- keep audit trail
- show deactivated status in roster

### 5. Reactivate User

This is not currently implemented in the backend.

Recommendation:

- explicitly leave reactivation out of V1 unless needed immediately
- if needed, add a `reactivate-user` edge function rather than manual DB edits

## Recommended UX

### V1 Surface

Best near-term home:

- current mobile admin app
- Settings tab
- admin-only section

Recommended structure:

- `Users`
- `Invite User`
- `User Roster`

### Invite Flow

Fields:

- email
- role
- campus

Buttons:

- `Send Invite`
- `Cancel`

Validation:

- valid email required
- role required
- campus required for `om_specialist` and `volunteer`

Success state:

- toast or banner
- user appears in roster

### User Roster Row

Show:

- email
- role
- campus
- active/inactive badge

Actions:

- `Change Role`
- `Deactivate`

Optional:

- `Copy Invite Email`
- `Resend Invite` later

## Backend Changes Needed

### Minimal V1

No major backend work is required if V1 only manages:

- `om_specialist`
- `volunteer`

Because `invite-user` already supports those roles.

### If Student Creation Is Required

Then update [invite-user](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/supabase/functions/invite-user/index.ts) to allow:

- `student`

But this should only be done if EchoEcho decides students are not anonymous-only.

### Recommended Additional Backend Work

V1.1 or alongside V1:

- add a read endpoint or direct admin query for roster listing
- add reactivation support if needed
- add stronger audit-log viewing later

## Data Model Expectations

The roster should use `profiles` as the canonical source for:

- `id`
- `role`
- `campus_id`
- `is_active`

The auth user/email source may come from:

- `auth.users`-derived admin function
- or denormalized metadata if needed

Recommendation:

- do not expose raw service-role access to the client
- keep Auth Admin operations in edge functions

## Permissions

Only `admin` should be able to:

- invite users
- change roles
- deactivate users

`om_specialist` should not have user-management privileges in V1.

## Suggested Delivery Phases

### Phase 1

- admin-only invite form
- admin-only user roster
- change role
- deactivate user

### Phase 2

- search/filter/sort
- resend invite
- reactivation flow
- audit trail UI

### Phase 3

- move user management to the web admin app

## Recommendation

Build user management now as a thin admin UI over the existing edge functions.

That gives immediate operational value and unblocks account creation without waiting for the web app.

Then move the same capability to the future web admin surface once that app exists.
