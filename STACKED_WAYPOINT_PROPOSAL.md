# Stacked Waypoint Proposal

## Status

Parked for post-POC.

The current POC priority is simpler:

- make student navigation reliably trigger waypoint annotations
- play the recorded waypoint clip when available
- fall back to transcript text when no clip exists

This document captures the proposed redesign for same-location waypoint handling so we do not have to re-derive it later.

## Problem

Today, route authoring allows one or more waypoints to be created at the exact same location.

That is not inherently wrong from an authoring perspective, but it creates poor navigation semantics:

- student navigation advances by waypoint index, not by physical location
- arrival is based on proximity radius, not on having moved past a point
- multiple waypoints at the same coordinates can trigger back-to-back while the user is standing still
- turn-direction math becomes ambiguous when route segments have zero length
- route progress can jump unexpectedly
- a route can complete while the user is still physically stationary

For a POC this is tolerable. For a real route-guidance product it is not.

## Proposed Product Model

A physical route point and its annotations should not be the same thing.

Proposed rule:

- one navigational waypoint per physical location
- zero or more ordered annotations attached to that waypoint

In other words, if an author records multiple notes at the same point, that should produce:

- one arrival event
- one progress increment
- one waypoint marker on the route
- an ordered annotation sequence for playback

## Recommended Data Shape

Replace the implicit "one DB waypoint row equals one note" model with:

### Waypoint

- `id`
- `route_id`
- `position`
- `latitude`
- `longitude`
- `heading`
- optional metadata needed for navigation only

### Waypoint Annotation

- `id`
- `waypoint_id`
- `position`
- `annotation_text`
- `annotation_audio_url`
- optional media metadata

This allows:

- a stable navigation path
- multiple audio/text notes at one physical point
- simpler playback semantics
- cleaner authoring UX

## Authoring Rules

Admin should allow multiple notes to be captured at the same location, but should not create multiple navigational targets for them.

Recommended behavior:

- if a new annotation is created at the same location as the previous waypoint, append it to that waypoint
- if the author intentionally wants a separate waypoint, they must move beyond a minimum distance threshold first

Threshold options:

- exact-coordinate only
- within `<= 1m`

Recommendation:

- use a small threshold such as `<= 1m`

Reason:

- exact-coordinate checks are too brittle with GPS jitter
- 5m is too large and would incorrectly merge distinct nearby instructions

## Student Playback Behavior

When a student reaches a waypoint:

1. Trigger arrival once for that physical point.
2. Play waypoint annotations in stored order.
3. For each annotation:
   - play recorded audio clip when available
   - otherwise speak the transcript text
4. After the annotation sequence completes, continue normal navigation.

Important behavior decisions:

- if a waypoint has no annotations, still allow normal turn guidance
- if the user moves away mid-playback, decide whether to interrupt or finish the current note
- if multiple clips exist, cap total playback duration if it becomes excessive

## POC Non-Goals

This redesign is explicitly out of scope for the current POC.

We are not doing this now:

- schema redesign
- admin waypoint/annotation split
- student multi-annotation playback queue
- save-time clustering logic

We are doing this now instead:

- fix student waypoint annotation triggering
- use waypoint audio when present
- fall back to transcript text when audio is absent

## Implementation Sketch

When we pick this up, the likely implementation order is:

1. Redesign the DB model so physical waypoints and annotations are separate.
2. Update admin route save flow to emit one waypoint with many annotations.
3. Update admin editing UI to show annotation lists within a waypoint.
4. Update student sync to download waypoint annotations separately.
5. Update student playback engine to play per-waypoint annotation sequences.
6. Add authoring safeguards for near-duplicate waypoint creation.

## Why This Is Safe To Park

The current blocker is not stacked-waypoint modeling.

The current blocker is that the student app does not yet reliably play waypoint annotations. Fixing that produces immediate POC value. The stacked-waypoint redesign is worth doing, but only after the basic trigger and playback path is working end to end.
