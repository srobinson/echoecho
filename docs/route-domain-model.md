# Route Domain Model

Date: 2026-03-13

This document turns the route-authoring proposal into a concrete domain model.

See also: [route-authoring-proposal.md](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/docs/route-authoring-proposal.md)

## Roles

### Student

- Can view and navigate published routes
- Cannot create, edit, review, or publish route content
- Signs in anonymously in the current product direction

### Volunteer

- Can create draft routes
- Can edit draft routes they own or are assigned
- Can walk and validate routes
- Can submit walked routes for review
- Cannot publish routes
- Cannot govern campus-wide structure unless explicitly granted admin privileges

### OM Specialist

- Can do everything a volunteer can do
- Can create and refine draft routes more broadly
- Can prepare routes for admin review
- Cannot publish routes

### Admin

- Can create and manage campuses, buildings, entrances, hazards, and POIs
- Can create draft routes
- Can assign routes to volunteers
- Can review submissions
- Can publish, unpublish, archive, or reject routes

## Route States

Recommended route lifecycle:

- `draft`
- `walk_assigned`
- `walk_in_progress`
- `walked`
- `changes_requested`
- `approved`
- `published`
- `archived`

### State Meanings

#### `draft`

- Created by `admin`, `om_specialist`, or `volunteer`
- May be point-and-click authored
- Not publishable

#### `walk_assigned`

- Draft is assigned to a `volunteer`

#### `walk_in_progress`

- `Volunteer` or `om_specialist` is actively validating or recording the route on campus

#### `walked`

- `Volunteer` or `om_specialist` completed the field pass
- Geometry, landmarks, and annotations reflect a real walked route
- Ready for admin review

#### `changes_requested`

- Admin reviewed the walked route and requested fixes

#### `approved`

- Admin approved the walked route content
- Ready to publish

#### `published`

- Route is visible to students

#### `archived`

- Route is retired and not available for student use

## Route Provenance

Routes should preserve who did what.

Recommended metadata fields:

- `drafted_by_user_id`
- `walked_by_user_id`
- `reviewed_by_user_id`
- `published_by_user_id`
- `assigned_to_user_id`
- `drafted_at`
- `walk_started_at`
- `walk_completed_at`
- `reviewed_at`
- `published_at`

## Route Data Layers

Separate the route into distinct conceptual layers.

### 1. Structural Route Geometry

- path segments
- ordered waypoints
- building/entrance associations

This is the minimum needed for a draft route.

### 2. Walk Validation Layer

- verified path adjustments
- confidence markers
- route notes from the walk
- confirmation that path is usable in practice

### 3. Guidance Layer

- instruction text or audio
- landmark cues
- hazard annotations
- timing/placement of prompts

### 4. Publication Layer

- review status
- published revision
- visibility controls

## Authoring Rules

### Draft Routes

Draft routes may be created by:

- admin
- `om_specialist`
- `volunteer`

Draft routes may be created from:

- point-and-click map editing
- copied route templates
- future imports or assisted generation

Draft routes must not be student-visible.

### Walked Routes

A walked route must represent a field-validated version of the route.

At minimum, walking should confirm:

- the path is traversable
- entrances/endpoints are correct
- critical landmarks and hazards are captured

### Published Routes

Published routes must be:

- walked
- reviewed by admin
- tied to a specific approved revision

## Revision Model

Routes should behave like revisioned content, not a single mutable record.

Recommended model:

- stable route identity
- multiple route revisions
- one current published revision

That avoids overwriting published guidance while a volunteer or `om_specialist` user is editing the next candidate version.

## Permission Matrix

### Student

- view published routes: yes
- draft route: no
- walk route: no
- review route: no
- publish route: no

### Volunteer

- view published routes: yes
- draft route: yes
- edit draft route: yes
- walk assigned route: yes
- submit walked route: yes
- publish route: no

### OM Specialist

- view published routes: yes
- draft route: yes
- edit draft route: yes
- walk assigned route: yes
- submit walked route: yes
- review-prep route: yes
- publish route: no

### Admin

- view published routes: yes
- draft route: yes
- edit any route: yes
- assign route: yes
- review route: yes
- publish route: yes
- manage campus/building structure: yes

## App Split Recommendation

### Student App

- published route consumption only

### Volunteer / OM Specialist Mobile App

- route walking
- field verification
- landmark/hazard capture
- targeted route corrections

### Admin Web App

- campus/building governance
- draft route authoring
- review and publish workflows
- volunteer assignment and oversight

### Volunteer / OM Specialist Web Tool

- draft route proposal
- pre-walk planning
- post-walk non-field cleanup

This may be the same web app as admin with role-based permissions rather than a separate codebase.

## Implementation Guidance

The most important design rule is:

- do not collapse `proposed by map click` and `walked in the field` into the same undifferentiated state

Those are different truth levels and should remain visible in both the data model and the UI.
