# Web Admin V1 Surface

Date: 2026-03-13

## Goal

Define the first useful web-based admin application for EchoEcho.

V1 should focus on governance workflows, not full parity with the current mobile operational app.

## Product Role

Primary user:

- `admin`

Secondary user:

- selected `om_specialist` access for specific authoring/review workflows, only where explicitly allowed

This is not the student app and not the primary volunteer field tool.

## V1 Design Principle

Build the web admin around the highest-governance workflows first:

- user management
- campus management
- building management
- route review / publish

Do not begin with:

- full route recording
- mobile parity
- advanced analytics
- full interior editing

## Recommended Information Architecture

### Auth

Routes:

- `/login`
- `/accept-invite`
- `/reset-password`

### App Shell

Primary navigation:

- Dashboard
- Campuses
- Buildings
- Routes
- Users
- Settings

Optional later:

- Interiors
- Hazards
- Analytics

## Recommended V1 Routes

### Dashboard

- `/`

Purpose:

- operational summary for admins

V1 contents:

- campuses count
- buildings count
- routes awaiting review
- recently published routes
- recent invites or deactivations

### Campuses

- `/campuses`
- `/campuses/new`
- `/campuses/:campusId`

Purpose:

- create and manage campuses
- replace campus boundaries
- inspect campus-level structure

V1 actions:

- create campus
- select/view campus
- replace boundary
- delete campus

### Buildings

- `/buildings`
- `/buildings/new`
- `/buildings/:buildingId`

Purpose:

- govern building outlines and entrances

V1 actions:

- create building
- edit building metadata
- edit entrances
- inspect assigned routes

### Routes

- `/routes`
- `/routes/:routeId`
- `/routes/review`

Purpose:

- review and publish route content

Recommended default list filters:

- Draft
- Walked / Ready for Review
- Published
- Retracted / Archived

V1 actions:

- inspect route
- compare route metadata and provenance
- publish
- retract
- request changes

Important:

- V1 web admin should be review-first, not field-recording-first

### Users

- `/users`
- `/users/invite`
- `/users/:userId`

Purpose:

- user management for operational accounts

V1 actions:

- invite `om_specialist`
- invite `volunteer`
- optional later: invite authenticated `student`
- change role
- deactivate user
- filter by campus and role

### Settings

- `/settings`

Purpose:

- global admin-only operational settings

V1 contents:

- environment info
- system version
- links to policies / support
- dangerous actions if needed later

## Recommended V1 Permissions

### Admin

Full access to:

- campuses
- buildings
- routes review/publish
- users
- settings

### OM Specialist

If allowed into web in V1, restrict to:

- route inspection
- limited draft authoring or review-prep
- building/campus read access

Do not allow:

- user management
- final publish
- campus deletion

### Volunteer

Do not target the volunteer as a V1 primary web persona.

If volunteer web access is added later, it should focus on:

- proposing draft routes
- reviewing assigned work
- pre-walk planning

## What Stays Out Of Scope For V1

- route recording / live GPS field capture
- full interior graph editor
- complex analytics dashboards
- hazard moderation workflows beyond basic visibility
- student-facing functionality

## Relationship To Current Mobile App

Near-term:

- current mobile admin app continues to carry field workflows
- web admin becomes the governance surface

That means:

- volunteer and `om_specialist` keep using mobile for field work
- admin uses web for user management, campuses/buildings, and review/publish

## Recommended Delivery Order

### Phase 1

- web auth shell
- dashboard
- users
- routes review/publish

### Phase 2

- campuses
- buildings

### Phase 3

- interiors
- expanded hazard governance
- analytics

## Recommendation

The first web admin should be small, governance-heavy, and obviously better than mobile for admin-only tasks.

If V1 tries to absorb all authoring and all mapping immediately, it will sprawl.

Start with:

- users
- campuses
- buildings
- routes review/publish

Then expand once the admin surface is established.
