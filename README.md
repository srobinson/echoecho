# EchoEcho

Campus navigation for blind and visually impaired students. No beacons, no LiDAR scans, no infrastructure. A phone in your hand, vibrations you learn in under a minute, and a voice that tells you where to go.

## The Problem

Getting across a college campus independently is an unsolved problem for blind students. The existing solutions all require something the campus does not have. BlindSquare needs Bluetooth beacons installed at every doorway. GoodMaps needs a team to walk every building with a LiDAR backpack. Aira needs a sighted human on a video call. These are real products that work, but they all scale slowly and expensively.

EchoEcho takes a different approach. An Orientation and Mobility specialist walks a route once with the admin app, recording GPS coordinates, compass headings, hazard locations, and voice annotations along the way. That route is stored as a sequence of waypoints. When a student needs to walk it, the student app provides turn-by-turn guidance through haptic vibration patterns and spoken instructions, using GPS outdoors and pedestrian dead reckoning (accelerometer and gyroscope) to maintain position continuity between buildings.

## How It Feels

The core interface is haptic. The phone vibrates in patterns that encode direction. This is not a gimmick. For someone navigating with a white cane in one hand and a phone in the other, audio alone is insufficient. Audio competes with traffic sounds, conversations, and the environmental cues a blind traveler is actively listening for. Vibration occupies a different sensory channel entirely.

Four candidate encoding schemes are under active research:

**Rhythm-based patterns** (current default). Straight ahead feels like a steady march: three even pulses. Left turn is a quick da-dum. Right turn is a slow da-dum-dum. Each direction has a distinct rhythmic character that you feel rather than count. Literature from a 2022 PMC study (n=30) showed 82 to 90 percent recognition accuracy for rhythm patterns in seated conditions and roughly 70 percent under cognitive load.

**Sequential pulse counting**. One buzz for straight, two for left, three for right. Simple to teach but research raises concerns about counting accuracy when the user is simultaneously tracking a cane, body position, and environmental cues.

**Duration encoding**. A short 80ms tap means continue. A medium 250ms pulse means left. A long 480ms pulse means right. No counting required, but the middle duration can be ambiguous under movement vibration.

**Proximity intensity ramp**. The phone buzzes faster as you approach a waypoint: every two seconds when far, every half second when close. This scheme layers on top of a directional cue and provides continuous spatial awareness without requiring active pattern recognition.

All four schemes are defined as millisecond-precision timing arrays and can be tested on device through a haptic lab built into the admin app. A formal within-subjects user study with visually impaired participants is designed and pending IRB approval to determine which scheme performs best under real walking conditions.

## How It Works

**Recording.** An O&M specialist or trained volunteer walks a route with the admin app open. At each decision point, the app captures GPS coordinates and compass heading. The specialist adds voice annotations ("the fountain will be on your left"), marks hazards (steps, surface changes, crossings), and takes reference photos. Routes go through a review lifecycle: pending_save, draft, published, retracted.

**Navigation.** A student opens the app and speaks a destination. The app matches the request to a building, finds a published route, and begins guidance. At each waypoint, the phone fires the appropriate haptic pattern for the upcoming direction and speaks the specialist's annotation. Navigation combines GPS with pedestrian dead reckoning (step detection via accelerometer, heading via gyroscope and magnetometer) so guidance continues when GPS signal drops between buildings.

**The iOS dictation problem.** Apple's Taptic Engine is silenced whenever speech recognition is active. For an app that uses both voice input and haptic output, this creates a direct conflict. EchoEcho implements a mutex: haptic cues are queued while voice recognition is open and fire immediately after the microphone closes. This is not a workaround. It is a hard platform constraint that any haptic navigation app on iOS must handle.

## Architecture

Two apps, one backend.

- **Admin** (`apps/admin/`). Route recording, campus management, hazard marking, haptic lab. Used by O&M specialists and volunteers.
- **Student** (`apps/student/`). Accessible navigation with haptic cues, audio instructions, and voice destination search. Screen reader driven throughout.

The backend is Supabase: PostgreSQL with PostGIS for spatial queries, row-level security scoped by user role, edge functions for auth and user management. Routes are stored as ordered waypoint sequences with computed path geometries.

The monorepo shares types, geo utilities, haptic timing definitions, and UI components across both apps through workspace packages.

## What Makes This Different

Most VI navigation technology falls into two categories: systems that need expensive infrastructure installed at the venue, or systems that need a human on the other end of a call. EchoEcho sits in neither camp. The recording step is a one-time walk by a sighted specialist. After that, the route is available to any student, any time, with no ongoing human involvement and no installed hardware.

The haptic encoding work is where the genuine research contribution lives. Translating bearing changes into vibration patterns that a person can reliably interpret while walking with a cane is a problem with real constraints. The phone's vibration motor is the only actuator. iOS and Android render the same timing arrays with perceptibly different tactile character. Ambient vibration from footsteps and cane taps creates noise. The four candidate schemes represent four different hypotheses about how to solve this, and the user study protocol is designed to produce an evidence-based answer rather than a design opinion.

## Development

The project uses Yarn workspaces with Turbo for task orchestration. A `justfile` wraps common operations.

```bash
just install          # Install dependencies
just admin            # Start admin app
just student          # Start student app
just check            # Typecheck + lint
just ci-local         # Full gate: typecheck + lint + test
just supabase-start   # Start local Supabase stack
```

Built for TSBVI (Texas School for the Blind and Visually Impaired) as the initial deployment target.
