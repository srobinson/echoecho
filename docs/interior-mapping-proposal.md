# Interior Mapping Proposal

Date: 2026-03-13

## Goal

Define how EchoEcho should approach building interiors without turning the product into a full CAD or enterprise indoor-mapping system.

The core recommendation is:

- interiors should be modelled as a floor-aware navigation graph
- interior authoring should be structurally web-first
- route truth should still be validated in the field

This note captures the product direction before the concrete indoor domain model.

## Core Idea

Indoor mapping should not start as a floorplan-drawing problem.

It should start as a navigation problem with explicit:

- buildings
- levels
- destinations
- pathways
- vertical transitions
- indoor/outdoor connectors

Floorplans may help authoring and visualization, but they are not the source of navigational truth by themselves.

## Why Interior Mapping Is Different

Outdoors, routes can often be represented as a path across open campus geometry.

Indoors, reliable navigation depends on:

- floor awareness
- hallway connectivity
- doors and entrances
- stairs/elevators/ramps
- room reachability
- route restrictions and accessibility semantics

That means indoor mapping should be graph-first, not polygon-first.

## Product Direction

### Structural Authoring Belongs On Web

Admin or governance-oriented tools should handle:

- building setup
- levels/floors
- hallway/path graph
- stairs, elevators, ramps
- entrances and openings
- destination placement
- indoor/outdoor connectors

This is better suited to a precise authoring surface than a mobile-first field UI.

### Field Validation Belongs On Mobile

Volunteers and `om_specialist` users should use mobile tools to:

- validate hallway/path correctness
- confirm destination reachability
- verify entrances and vertical connectors
- add landmarks and hazards
- correct route truth where the map is wrong

This matches the outdoor route-authoring philosophy: map draft first, field truth second.

## Recommended Workflow

1. Admin creates the building shell and levels.
2. Admin authors or imports the baseline indoor structure.
3. Admin creates the indoor hallway/path graph and key connectors.
4. Admin, `om_specialist`, or `volunteer` creates draft indoor-capable routes.
5. `Volunteer` or `om_specialist` validates routes in the building and refines landmarks/hazards/instruction truth.
6. Admin reviews and publishes.

## Scope Recommendation For V1

Do not start with exhaustive room polygon editing.

Start with:

- important buildings only
- major public floors only
- key destinations
- corridors/pathways
- stairs/elevators/ramps
- entrances and door/connect points
- major landmarks and hazards

That is enough to support:

- outdoor-to-room navigation
- room-to-room navigation inside priority buildings

## What To Avoid In V1

- BIM/CAD-perfect digital twins
- mapping every room polygon
- dependency on indoor blue-dot positioning
- overly visual floorplan tooling before route graph correctness exists

## External References

The 2026 research points to these references:

- `IMDF` for practical indoor feature taxonomy
- `IndoorGML 2.0` for graph/connectivity concepts
- `ArcGIS Indoors` for structured indoor authoring and routing workflow
- `Mappedin`, `MapsIndoors`, `Situm`, and `MazeMap` for product benchmarks
- `QField` and `Mergin Maps` for field validation workflow patterns

## Recommendation

EchoEcho should treat interior mapping as:

- a structured web-authored indoor graph
- refined by volunteer / `om_specialist` field validation
- published under the same governance model as outdoor routes

This preserves product focus and keeps indoor mapping tied to assistive navigation quality, not generic map completeness.
