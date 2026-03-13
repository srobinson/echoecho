# Interior Domain Model

Date: 2026-03-13

This document turns the interior mapping proposal into a concrete EchoEcho domain model.

See also: [interior-mapping-proposal.md](/Users/alphab/Dev/LLM/DEV/helioy/client-projects/echoecho/docs/interior-mapping-proposal.md)

## Core Entities

Recommended v1 indoor model:

- `building`
- `level`
- `destination`
- `indoor_node`
- `indoor_edge`
- `vertical_connector`
- `outdoor_indoor_connector`
- `landmark`
- `hazard`

These entities should support indoor routing without requiring exhaustive room polygons.

## Entity Roles

### Building

Represents the overall physical structure.

Responsibilities:

- belongs to a campus
- owns levels
- owns major entrances
- provides the indoor boundary/context for routing

### Level

Represents a floor or navigable level of a building.

Responsibilities:

- belongs to a building
- has a level index or canonical identifier
- owns nodes, edges, destinations, and level-scoped landmarks/hazards

### Destination

Represents a place a student may navigate to.

Examples:

- classroom
- office
- restroom
- reception desk
- library desk
- service counter

Responsibilities:

- belongs to a level
- attaches to a nearby node or connector
- may optionally reference a room/unit geometry later

### Indoor Node

Represents a navigable decision point.

Examples:

- corridor intersection
- doorway threshold
- elevator lobby point
- stair landing
- major turn point

Responsibilities:

- belongs to a level
- participates in the routing graph
- can anchor landmarks, hazards, and instructions

### Indoor Edge

Represents a walkable segment between two nodes.

Examples:

- hallway segment
- lobby crossing
- passage between doorway and corridor

Responsibilities:

- belongs to a level
- has start and end nodes
- carries route-affecting metadata

Recommended metadata:

- distance
- accessibility attributes
- confidence
- one-way or restricted flags if needed later

### Vertical Connector

Represents movement between levels.

Examples:

- elevator
- stairs
- ramp
- lift platform

Responsibilities:

- connects nodes across levels
- carries accessibility semantics
- participates directly in route selection

### Outdoor-Indoor Connector

Represents the handoff between campus routes and indoor routes.

Examples:

- building entrance
- lobby entry point
- accessible side entrance

Responsibilities:

- connects an outdoor node/entrance to an indoor node
- defines the explicit transition between outdoor and indoor navigation

### Landmark

Represents a navigational cue.

Examples:

- front desk
- textured floor change
- water fountain
- railing
- noisy doorway

Responsibilities:

- attaches to nodes, edges, or destinations
- contributes to route instructions and confidence

### Hazard

Represents a navigational risk or constraint.

Examples:

- temporary obstruction
- heavy door
- narrow passage
- noisy or confusing area
- construction

Responsibilities:

- attaches to nodes, edges, levels, or destinations
- may change route eligibility or guidance text

## Graph Model

Indoor navigation should be graph-based.

Recommended structure:

- `indoor_node` and `indoor_edge` form the floor-level graph
- `vertical_connector` links graphs across levels
- `outdoor_indoor_connector` links the indoor graph to the campus graph

This allows:

- room-to-room routing
- campus-to-room routing
- floor-to-floor routing

## Accessibility Semantics

Accessibility must be embedded in the graph model.

Recommended route-affecting metadata:

- `is_accessible`
- `requires_assistance`
- `restricted_access`
- `confidence`
- `temporary_blocked`
- `connector_type`

This is more reliable than trying to infer accessibility after the route is already computed.

## Authoring States

Indoor data should follow the same truth separation used for routes.

Recommended state split:

- `structural_draft`
- `field_validated`
- `published`

### Structural Draft

- web-authored baseline indoor graph
- may be imported, traced, or manually authored
- not yet trusted as route truth

### Field Validated

- volunteer or `om_specialist` has confirmed the path and destination reachability in the real building
- landmarks and hazards have been refined

### Published

- admin has approved the indoor data or route revision for student use

## Authoring Split

### Admin / Web

Owns:

- buildings
- levels
- destinations
- hallway/path graph
- vertical connectors
- outdoor/indoor connectors
- review and publish controls

### Volunteer / OM Specialist Mobile

Owns:

- field validation
- landmark capture
- hazard capture
- path corrections
- destination reachability checks

### Student

Consumes:

- published indoor-capable routes

## Revision Guidance

Do not mutate published indoor structures blindly.

Prefer:

- stable entity identity
- revisioned route or graph content where needed
- published snapshots for student-facing navigation

This protects student guidance while edits are underway.

## Most Important Rule

Do not collapse these into one thing:

- a floorplan or structural indoor draft
- a validated indoor navigation graph
- a published indoor route

Those are different truth levels and should remain explicit in both the schema and the product.
