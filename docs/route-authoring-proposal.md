# Route Authoring Proposal

Date: 2026-03-13

## Goal

Split the current dual-purpose admin experience into a cleaner workflow with separate responsibilities for:

- `student`: consumes published routes
- `volunteer`: primarily proposes, walks, and submits routes
- `om_specialist`: elevated operational author/review-prep role
- `admin`: governs campuses, buildings, review, and publishing

This proposal captures the product direction before locking in a deeper domain model.

## Core Idea

Route creation should be separated into two distinct activities:

1. `drafting`
2. `verification`

Drafting can happen from a map.
Verification must happen in the real world.

That means a route can be proposed by point-and-click, but it should not become publishable until it has been physically walked and validated by a `volunteer` or `om_specialist`.

## Proposed Role Split

### Student

- Accesses published routes only
- Does not author or review map content

### Volunteer

- Has on-campus knowledge
- Can propose draft routes
- Can walk routes and refine them in the field
- Can submit walked routes for review

Volunteers should have access to both:

- a mobile tool for field validation and walked-route capture
- a web tool for proposing and lightly editing draft routes

### OM Specialist

- Has all volunteer capabilities
- Can refine route drafts more broadly
- Can prepare content for admin review
- Does not replace `admin` as the final governance role

### Admin

- Creates and manages campuses
- Creates and manages buildings and entrances
- Oversees hazards, POIs, and governance
- Reviews and publishes walked routes
- Can also propose draft routes, but should not bypass the walked-route quality gate for publishable student guidance

## Recommended Workflow

1. Admin creates the campus, boundary, buildings, entrances, and core map layers.
2. Admin, `om_specialist`, or `volunteer` proposes a draft route by point-and-click on a map.
3. `Volunteer` or `om_specialist` walks the route on campus.
4. `Volunteer` or `om_specialist` adjusts geometry, confirms path viability, adds landmarks, hazards, and instruction timing.
5. `Volunteer` or `om_specialist` submits the walked route.
6. Admin reviews and publishes.

## Why Proposed Routes Matter

Point-and-click route drafting is still valuable.

It gives EchoEcho:

- faster initial coverage
- easier desktop authoring
- a way for volunteers and `om_specialist` users to express campus knowledge before walking
- a reviewable route draft before field verification starts

Point-and-click should be treated as a draft authoring tool, not a substitute for route walking.

## Why Walked Routes Still Matter

Walking the route captures information a map alone cannot reliably provide:

- which path is actually usable
- whether entrances and crossings work in practice
- where landmark cues are meaningful
- where guidance timing needs to change
- where hazards exist that are missing from the map
- where the route feels confusing or unsafe for a blind or low-vision student

If EchoEcho drops walked verification, it risks becoming a map-drawing product instead of a navigation product.

## Product Implications

### Mobile Operational Tool

The `volunteer` / `om_specialist` mobile experience should prioritize:

- walking and validating draft routes
- recording route truth
- capturing landmarks and hazards
- making targeted route corrections in the field

It does not need to be the primary system for creating campuses and buildings.

### Web Admin Tool

The admin web experience should prioritize:

- campus creation
- building and entrance management
- governance workflows
- review and publishing
- draft route authoring and inspection

### Volunteer / OM Specialist Web Tool

Volunteers and `om_specialist` users should also have access to a web authoring surface for:

- proposing draft routes
- making non-field geometry adjustments
- reviewing submitted or assigned draft routes before walking them

## Non-Goals For This Proposal

This note does not define:

- exact route lifecycle states
- database schema
- permission matrix
- app/package boundaries

Those belong in a separate domain-model document.

## Recommendation

Adopt a hybrid model:

- map-authored routes are valid drafts
- walked routes are the publishable source of truth
- volunteers can propose drafts on web and validate them on mobile
- `om_specialist` can do the same with broader authoring authority
- admins govern, review, and publish

This keeps the system fast enough to build coverage while preserving the field-validation bar that assistive navigation requires.
