# User Review

## Context

Reviewer signed into the admin app, had no nearby campus, selected the existing `TSBVI` campus, and landed on the default `Map` tab.

## Observations

### 1. Campus selection transition

- Current experience: after selecting `TSBVI`, the map visibly pans from far away into the campus.
- Expected experience: load directly at the selected campus coordinates with no dramatic travel animation.
- UX assessment: the pan reads as unnecessary motion and slows down orientation instead of helping it.

### 2. Initial post-login screen is unclear

- Current screen appears to be a satellite map with:
  - 1 visible route
  - 3 visible buildings
  - layer toggles
  - `Add Building`
  - `Record`
- Reviewer was unsure whether this was:
  - a route-specific screen
  - a campus overview
  - the only route currently available

### 3. Information architecture is not obvious

- Current behavior: user lands on the general `Map` tab, not a route detail screen.
- If there were 10 routes, current product behavior would likely be:
  - all routes shown spatially on the map tab
  - full route list in the `Routes` tab
  - buildings in the `Buildings` tab
  - hazards in the `Hazards` tab
- UX issue: the current map screen does not explain that clearly, so sparse data can make it feel like a single-route management screen.

### 4. Primary user tasks are underspecified

Reviewer expectation for this screen:

- select/edit route
- add new route
- add building
- add hazard

Current action model:

- `Add Building` is available on the map screen
- `Record` is the route creation entry point
- hazards are managed in a separate `Hazards` tab

UX issue:

- route creation and building creation are surfaced here
- hazard creation is not
- this makes the screen feel inconsistent and leaves the user unclear about what they are supposed to do next

### 5. Building detail from map is read-only in the wrong place

- Current experience: tapping a building on the main map opens the property/building detail panel, but it does not expose edit actions.
- UX issue: in an admin app, opening a property from the main operational map implies that the user should be able to act on it immediately.
- Current result: the panel behaves as view-only, which creates friction and forces the user to infer that editing may exist somewhere else.

Reviewer expectation:

- building detail opened from the map should support admin actions directly, such as:
  - edit building details
  - manage entrances
  - navigate to a deeper edit flow if needed

UX assessment:

- read-only detail is a poor fit for the main admin map context
- the map is functioning like an admin workspace, so selected objects should feel actionable, not passive
- if editing is intentionally deferred to another screen, the panel should make that explicit with a clear `Edit` action

### 6. Route creation CTA and flow are confusing

- Current main CTA on the map screen is `Record`.
- Reviewer expectation: `Record` is ambiguous in this context.
- Preferred labeling:
  - `Add Route`
  - or `New Route`

Why this matters:

- the main map already feels like an admin workspace for viewing and editing campus objects
- in that context, the user interprets the primary action as “create a route here”
- `Record` reads as a device/media capture action rather than a route-authoring action

### 7. Route creation should preserve the current map context

- Current mental model:
  - user pans around the map
  - finds the intended insertion area
  - clicks the primary CTA to start adding a route
- Reviewer expectation:
  - the map should stay exactly where it is
  - no automatic movement should happen
  - route creation should begin in-place from the current viewport

Suggested behavior:

- clicking `Add Route` should not move the map at all
- the app should enter a route creation mode directly on the same map
- the user should be able to drop the first waypoint at the intended starting position

### 8. Severe viewport bug when entering route creation

- Current experience after clicking `Record`:
  - map zooms out to a world view
  - then zooms into a different location (`Palo Alto`)
- UX assessment:
  - this is both a bug and a strong trust-breaker
  - it breaks the user’s spatial context immediately after they intentionally positioned the map

Implication:

- current route creation flow conflicts with the user’s mental model of “I choose the place, then start adding the route there”

### 9. Missing direct geometry editing expectations

Reviewer expects the main map workspace to support spatial editing for core objects:

- edit building map boundaries
- edit route waypoints

UX interpretation:

- because the map is the primary spatial canvas, geometry edits feel like they belong here
- if those edits are not available directly, the app should clearly indicate where they happen instead

## Product interpretation

The current map tab is functioning as a campus overview and spatial editing workspace, but it does not communicate that role clearly enough.

Main problems:

- unclear “where am I?” framing
- unclear “what should I do next?” guidance
- inconsistent exposure of primary creation actions
- sparse datasets make the overview feel like a specific route screen rather than a campus workspace
- selected buildings from the main map do not feel actionable enough for an admin workflow
- route creation CTA wording does not match the user’s task model
- route creation currently breaks map context instead of preserving it
- spatial editing expectations for buildings/routes are not clearly supported

## Role model and campus selection confusion

### 10. The app is using the wrong mental model for its primary user

- Current terminology uses `Admin`.
- Reviewer clarification: the real primary user is closer to a `Volunteer`.
- This matters because the product currently behaves like a centralized admin console, while the real workflow is field-based and location-driven.

Reviewer interpretation of the intended user:

- volunteer is affiliated with a campus
- volunteer goes on-site to create routes for that campus
- volunteer is physically present while recording and annotating the route

UX issue:

- the current product mixes two different roles into one experience:
  - a field volunteer creating routes on location
  - a true admin with oversight across all campuses
- that role conflation makes several behaviors feel wrong, especially campus selection, first-load map behavior, and creation affordances

### 11. Expected first-login volunteer flow

Reviewer expectation after login:

- app checks the user’s real current location
- app matches that location against registered campuses
- if a nearby campus exists, it is auto-selected
- if no nearby campus exists, the user can choose from existing campuses

Reviewer uncertainty:

- presenting `Create Campus` to this user may be the wrong UX entirely
- that action feels more like a platform-admin capability than a volunteer capability

UX interpretation:

- first-login behavior should be location-first, not campus-management-first
- the product should treat “which campus am I currently at?” as the primary question
- manual campus creation introduces too much administrative responsibility into what should be a field workflow

### 12. Active campus persistence is causing the wrong map behavior on login

- Current bug observed by reviewer:
  - on login, the map pans to an existing campus that is nowhere near the reviewer’s actual location
- Root cause identified during review:
  - reviewer had previously created a campus
  - app then auto-restored that campus as `activeCampus`
  - login flow therefore resumed that prior campus context instead of prioritizing current geolocation

UX issue:

- persistent `activeCampus` is overpowering real-world location context
- this makes the app feel like a desktop admin console instead of a field tool
- it breaks trust because the first screen implies the system knows where the user is, but it is actually restoring stale campus state

Reviewer expectation:

- on login, current location should take precedence over previously selected campus
- previously selected campus may still matter as a manual fallback or settings preference
- it should not silently override the user’s physical location in the default volunteer workflow

### 13. First map screen should open at user location, not campus center

- Reviewer expectation:
  - when first logged in, the map should display the user’s current location
- Clarification:
  - campus selection from Settings is still valid as an explicit override
  - but default landing behavior should remain anchored to current location

Why this matters:

- the volunteer’s job begins in the field
- route recording starts from where the person is physically standing
- showing an arbitrary or previously selected campus center creates immediate disorientation

### 14. Campus creation should likely be removed from the volunteer flow

- Reviewer request: remove `New Campus`
- Product implication:
  - volunteer-facing onboarding should not encourage casual campus creation
  - campus creation appears to belong to a higher-permission operational/admin flow, if it belongs in this app at all

Recommendation:

- remove campus creation from the default volunteer entry flow
- if campus creation remains a supported capability, move it behind a separate admin-only path with clearer intent and permissions

## Building creation and editing feedback

### 15. Current POC behavior after login is understandable, but not the intended long-term volunteer flow

- Current observed flow on device:
  - login
  - `No campus found`
  - option to `Create campus` or select an existing campus
- Reviewer note:
  - for a volunteer-facing product, showing the campus list here is probably the wrong behavior
  - however, this is acceptable as a temporary POC compromise

Product interpretation:

- the geo lookup appears to be happening, because the app correctly reached the `No campus found` state
- the current fallback is workable for testing
- this should remain explicitly documented as a temporary POC behavior, not the target volunteer UX

### 16. Creating a new campus now correctly centers the map on the user’s location

- Reviewer created a new campus named `batshit`
- Observed result:
  - after creation, the map correctly centered on the reviewer’s real location

Assessment:

- this confirms the recent location-first map initialization is working in the new-campus case

### 17. Building creation flow is learnable, but the affordance is unclear

Observed flow:

- tap `Add Building`
- tap once on the map
- a dot appears
- tap again
- a line appears
- only after several taps does it become clear that the user is defining a building boundary polygon

UX issue:

- the interaction model is not communicated up front
- the first marker looks like “drop a point” rather than “start drawing a footprint”
- the user must infer the polygon-building behavior by trial and error

Reviewer suggestion:

- entering `Add Building` mode should visibly change the interaction state
- example:
  - cursor changes to a pin/crosshair/drawing mode affordance
  - helper copy explains that taps define the building boundary

### 18. Building footprint creation appears limited to triangles

- Observed bug:
  - after placing a third point, the metadata panel appears immediately
  - this prevents adding additional corners
- Result:
  - user can only create triangular buildings

Expected behavior:

- user should be able to place as many boundary points as needed before explicitly closing/saving the polygon

Severity:

- high, because it blocks realistic building footprint creation

### 19. Entrance-marking flow is mostly intuitive, but map feedback is incomplete

Observed flow:

- after saving the building, app enters `Mark Entrance`
- large `Skip Entrance` CTA is visible
- reviewer taps a wall intuitively
- form appears to name the entrance or mark it as `Main`
- reviewer selects `Main`
- star icon appears on the wall
- reviewer adds another entrance named `Back Door`
- `Back Door` appears in the panel list
- no second icon appears visibly on the map

Assessment:

- `Main` selection behavior is a good touch
- first entrance interaction is intuitive enough
- second entrance lacks reliable spatial feedback

Bug / UX issue:

- entrance list and map visualization appear out of sync
- user cannot trust that the second entrance was actually placed correctly

### 20. Selected building has weak editability and no spatial editing affordance

Observed flow:

- tap existing building
- panel appears
- no clear visual cue on the map that the building is selected
- building cannot be moved
- corners cannot be dragged
- shape cannot be resized or adjusted
- `Edit` only changes the building name

UX issue:

- selection does not feel spatially actionable
- the map behaves more like a passive viewer than an editing surface once the building exists

Reviewer expectation:

- selected building should visibly highlight on the map
- admin/volunteer should be able to:
  - move the footprint
  - adjust corners
  - reshape the boundary
  - edit entrances

### 21. Building delete flow has both visual and functional problems

Observed flow:

- tap building
- choose `Delete`
- white native popup appears
- confirm delete
- building remains on the map

Issues:

- visual quality:
  - the delete confirmation popup feels jarring and out of place relative to the rest of the UI
- functional bug:
  - building is not actually deleted after confirmation

Severity:

- high, because destructive actions must be trustworthy and final state must match user intent

### 22. Entrance markers should eventually support direct editing

- Nice-to-have follow-up, not required for the current POC
- Reviewer expectation:
  - tapping an entrance marker should allow editing the entrance
  - editing should ideally include:
    - rename
    - reassign `Main`
    - reposition on the building edge

Recommended future behavior:

- entrance tap opens a lightweight entrance editor
- selected entrance gets a clear visual highlight on the map
- repositioning should snap back to the building boundary rather than allowing arbitrary free placement

Priority assessment:

- useful and aligned with the spatial editing model
- lower priority than core route recording, building footprint editing, and other blocking workflow issues

## Recommendations

### Short-term

- remove long camera pan on campus selection
- add explicit top-level framing such as `Campus Overview`
- add helper copy for low-data states to explain what the map is showing
- make creation actions consistent across core objects
- make building detail opened from the map editable or provide a clear `Edit` handoff
- rename `Record` to `Add Route` or `New Route`
- keep the current map viewport fixed when starting route creation
- start route creation in-place on the map instead of navigating through disorienting camera movement
- support or clearly expose geometry editing for building boundaries and route waypoints
- redefine the default user mentally and in copy as a field volunteer rather than a centralized admin
- make current geolocation the primary input for first-login campus selection
- treat `activeCampus` as secondary state, not the primary source of truth on first load
- remove or isolate campus creation from the volunteer-facing onboarding flow
- document the current `Create campus` / `Select campus` fallback as a POC-only behavior
- make `Add Building` clearly enter a footprint-drawing mode with better visual instruction
- allow building footprints with more than three points before metadata/save
- ensure every marked entrance renders clearly on the map
- visually highlight selected buildings on the map
- support true spatial editing for existing building footprints
- fix building deletion so confirmation actually removes the building
- add entrance editing as a later enhancement, including rename, main-toggle, and reposition-on-wall behavior

### Possible UI direction

- top summary/header panel:
  - campus name
  - short explanation of this screen
- quick actions:
  - `Add Route`
  - `Add Building`
  - `Add Hazard`
- supporting guidance:
  - routes can also be managed in `Routes`
  - buildings can also be managed in `Buildings`
  - hazards can also be managed in `Hazards`

## Source feedback

Quoted/paraphrased review points:

- “I see a single route with 3 buildings.”
- “Is it because there is only one route that I am sent directly to this screen?”
- “I am wondering what would be the experience if there were 10 routes.”
- “What am I supposed to be doing here?”
- “Viewing property detail panel from main map has no edit button capabilities, read only, which is not good UX for an admin app.”
- “The main CTA here is Record, which initially is a bit confusing.”
- “New Route or Add Route would be much more descriptive.”
- “I pan around the map to find my insertion point. This feels natural to me.”
- “I click Record, and the map zooms out to a world view, then zooms back into Palo Alto.”
- “Add Route should keep the map exactly where it is and let the user drop the starting waypoint.”
- the map should behave like a spatial authoring canvas,
  including expectations around:
    - editing building boundaries
    - editing route waypoints
    - dropping the first route point in place
- “Admin === volunteers who are with a campus and volunteer to create routes for the campus.”
- “After login, match my geo location against registered campuses and auto select.”
- “If there is no match then volunteer is presented with option to create a new campus. I can also select from a list of existing campuses.”
- “We are conflating volunteer who creates routes on location and a true admin app which has oversight of all campuses.”
- “The bug is, on login the map pans to an existing campus which is nowhere near my location.”
- “When I log in and since I created a campus it now auto pans there.”
- “No campus found... Create campus or select campus.”
- “For Volunteer we should not display select campus... however this is a POC build so we just going to make a note for future builds.”
- “Using my device, I log in, create a new campus ‘batshit’, map correctly pans to my location.”
- “Add Building... a dot appears on the map... it's not clear that I am defining boundary.”
- “I drop a second pin and a line is drawn... ahh I get it now.”
- “I drop a 3rd pin and here is the bug... you can only have triangular buildings.”
- “I see Back Door in the Mark Entrance panel but no new icon on the map.”
- “Click on building... no visual cue on map that building is selected.”
- “Not possible to move the building, alter the corners, resize, change the shape.”
- “Edit allows me to change name nothing else.”
- “Delete... confirm delete... Building is not deleted.”
- “If I click entrance can I edit, including reposition.”
