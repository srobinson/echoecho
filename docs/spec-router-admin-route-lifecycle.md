# Route Lifecycle and Governance Spec

Date: 2026-03-13

## Purpose

Map the current EchoEcho route lifecycle against the proposed workflow:

- `draft`
- `walked`
- `review`
- `published`

This note focuses on:

- current schema and route statuses
- publish / retract behavior
- current admin route UI flows
- missing provenance, review, and revisioning

## Current State

### Route Status Model

The current baseline schema supports only four statuses:

- `pending_save`
- `draft`
- `published`
- `retracted`

`pending_save` is an internal transactional save state, not a user-facing governance state.

Source:

- `routes.status` check in `supabase/migrations/20260310000001_baseline.sql`

### Current Lifecycle In Practice

The real route lifecycle today is:

1. recorder captures a route on mobile
2. `save_route()` writes the route as `pending_save`
3. the RPC finalizes it as `draft`
4. admin or OM specialist can `publish`
5. published route can later be `retracted`

That means EchoEcho currently has:

- capture
- save
- publish
- retract

It does **not** currently have:

- walked vs unwalked distinction
- review state
- approval state
- changes-requested state
- assignment state
- revisioned drafts

## Current Schema and Functions

### Routes Table

Current route-level provenance fields:

- `recorded_by`
- `recorded_at`
- `published_by`
- `published_at`

Current route-level governance gaps:

- no `drafted_by`
- no `walked_by` separate from `recorded_by`
- no `reviewed_by`
- no `assigned_to`
- no `approved_at`
- no `review_state`
- no revision lineage beyond reverse-route pairing

### save_route()

Current behavior:

- route is inserted as `pending_save`
- the save transaction populates path, waypoints, hashable content, and metadata
- route ends the transaction as `draft`

This is a save-atomicity mechanism, not a workflow state machine.

### publish_route()

Current behavior:

- only `admin` and `om_specialist` may publish
- function only accepts routes currently in `draft`
- publish creates or refreshes a reverse route automatically
- reverse route is also published

What this implies:

- publish is still coupled to reverse-route generation
- publishing is a route-pair operation, not a review/publish operation on a specific validated revision
- the system treats any `draft` as publish-ready if permissions allow it

### retract_route()

Current behavior:

- only `admin` and `om_specialist` may retract
- retract changes `published` to `retracted`
- reverse route is also retracted

This is effectively an archive/unpublish action.

## Current UI Flows

### Save Flow

`apps/admin/app/save-route.tsx` is a post-recording metadata form.

It supports:

- reviewing captured waypoints
- assigning route name / buildings / tags / difficulty
- saving to DB

It does **not** support:

- explicit review submission
- assignment to reviewer
- walked/not-walked declaration
- route revision management

### Routes List

`apps/admin/app/(tabs)/routes.tsx` filters routes by:

- `draft`
- `published`
- `retracted`

This confirms the current product only exposes those governance states.

### Route Detail

`apps/admin/app/route/[id].tsx` supports:

- metadata editing
- publish
- archive
- delete

It also references “version history”, but that is only a best-effort query against `route_versions`, which does not exist in the consolidated baseline.

This is an important mismatch:

- the UI language implies versioning
- the baseline schema does not actually provide first-class route revisions

## Comparison Against Proposed Workflow

### Proposed States

The proposed governance model needs something closer to:

- `draft`
- `walk_assigned`
- `walk_in_progress`
- `walked`
- `changes_requested`
- `approved`
- `published`
- `archived`

### Current Gaps

#### 1. Draft Conflates Multiple Truth Levels

Today `draft` can mean all of these:

- freshly recorded route
- route awaiting QA
- route needing edits
- route ready to publish
- route restored after retraction

That is too overloaded to support operational/admin separation cleanly.

#### 2. No Review State

There is no schema-level concept of:

- submitted for review
- changes requested
- approved

So publish currently acts as both review and release.

#### 3. No Walk Validation Distinction

The proposed model distinguishes:

- map-authored draft
- field-walked / validated route

The current model does not.

Everything becomes a plain `draft`.

#### 4. No Assignment Model

There is no route assignment state for:

- assigned volunteer
- assigned reviewer

That will matter once volunteer / `om_specialist` and admin responsibilities are separated more cleanly.

#### 5. No Real Revision Model

There is no stable route identity with multiple revisions.

Current system behavior:

- one mutable route row
- optional reverse route row
- best-effort UI hook for non-existent `route_versions`

This is the biggest structural gap if EchoEcho wants governed drafting/review/publish.

#### 6. Reverse Route Coupling

Reverse-route generation is embedded inside publish.

That means:

- reverse route is treated as a publication side effect
- not as a separately reviewed or separately validated route artifact

This may be acceptable for simple outdoor routes, but it is weak for the future operational/admin model and especially weak for indoor or accessibility-sensitive routing.

## Recommended Direction

### 1. Separate Workflow State From Save State

Keep `pending_save` only as an internal write state if needed.

Introduce explicit workflow states such as:

- `draft`
- `walk_assigned`
- `walk_in_progress`
- `walked`
- `changes_requested`
- `approved`
- `published`
- `archived`

### 2. Add Route Provenance Fields

Recommended additions:

- `drafted_by`
- `walked_by`
- `reviewed_by`
- `published_by`
- `assigned_to`
- `walk_started_at`
- `walk_completed_at`
- `reviewed_at`
- `approved_at`

### 3. Introduce Real Revisions

Recommended model:

- stable route identity
- separate route revisions
- one current published revision

That allows:

- routers to edit drafts without mutating live published guidance
- admins to review a specific revision
- future version history UI to be real, not aspirational

### 4. Decouple Reverse Routes From Publish

Recommended change:

- reverse route should become an explicit derivative or sibling route revision, not an invisible side effect of publishing

At minimum:

- mark reverse generation as system-derived
- keep provenance visible
- allow future validation rules to differ for reverse travel if needed

### 5. Add Review Submission Flow

Recommended transitions:

- volunteer or `om_specialist` saves or proposes route → `draft`
- volunteer or `om_specialist` submits for validation/review → `walked`
- admin reviews → `changes_requested` or `approved`
- admin publishes → `published`

## Bottom Line

Current EchoEcho route governance is still:

- save as draft
- publish draft
- retract published route

That is too shallow for the proposed operational / admin split.

The two biggest missing pieces are:

- explicit workflow states beyond `draft`
- real revision/provenance modelling

Without those, the role split will stay superficial in the UI even if auth roles change underneath it.
