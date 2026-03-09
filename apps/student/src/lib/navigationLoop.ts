/**
 * Navigation loop for offline turn-by-turn guidance (ALP-963).
 *
 * Runs entirely from local SQLite — zero network calls during active navigation.
 * Receives GPS position updates at ~1 Hz and produces haptic + audio callbacks.
 *
 * GPS positioning is primary. When GPS horizontal accuracy exceeds 15m, the loop
 * signals the positioning layer (ALP-956/ALP-957) to engage PDR fallback.
 * IMU-only navigation is capped at 80m before prompting GPS re-acquisition.
 *
 * Heading deviation threshold: 20° for 3 consecutive readings triggers a haptic
 * correction. Single-reading spikes (GPS noise) are ignored.
 */

import { getOrderedWaypoints, type LocalWaypoint } from './localDb';

// ── Constants ──────────────────────────────────────────────────────────────

const WAYPOINT_ARRIVAL_RADIUS_M = 5;    // meters — considered arrived at waypoint
const HEADING_DEVIATION_THRESHOLD_DEG = 20;
const HEADING_DEVIATION_CONSECUTIVE = 3; // readings before triggering haptic
const GPS_ACCURACY_PDR_TRIGGER_M = 15;   // metres accuracy that triggers PDR mode
const PDR_MAX_DISTANCE_M = 80;           // IMU-only cap before prompting GPS re-acq

// ── Types ──────────────────────────────────────────────────────────────────

export type PositioningMode = 'gps' | 'pdr';

export interface PositionUpdate {
  lat: number;
  lng: number;
  heading: number;
  /** Horizontal accuracy in metres (from GPS provider). */
  accuracy: number;
}

export interface NavigationCallbacks {
  /** Called when the heading deviates from the route bearing. */
  onHapticCorrection: (headingError: number) => void;
  /** Called when a waypoint is reached. */
  onWaypointArrived: (waypoint: LocalWaypoint) => void;
  /** Called when the route is fully completed. */
  onRouteCompleted: () => void;
  /**
   * Called when positioning mode should change.
   * The positioning service (ALP-956/957) responds by switching GPS/PDR.
   */
  onPositioningModeChange: (mode: PositioningMode) => void;
  /** Called when PDR distance cap is reached — GPS re-acquisition required. */
  onGpsReacquisitionNeeded: () => void;
}

export interface NavigationLoopState {
  currentWaypointIndex: number;
  consecutiveDeviationCount: number;
  positioningMode: PositioningMode;
  pdrDistanceM: number;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a stateful navigation loop for a route.
 *
 * Returns an object with `onPositionUpdate` to call on each GPS/PDR tick,
 * and `getState` for external status inspection.
 */
export function createNavigationLoop(
  routeId: string,
  callbacks: NavigationCallbacks
) {
  let waypoints: LocalWaypoint[] = [];
  let loaded = false;

  const state: NavigationLoopState = {
    currentWaypointIndex: 0,
    consecutiveDeviationCount: 0,
    positioningMode: 'gps',
    pdrDistanceM: 0,
  };

  async function loadWaypoints(): Promise<void> {
    waypoints = await getOrderedWaypoints(routeId);
    loaded = true;
  }

  // Eagerly load waypoints; onPositionUpdate is a no-op until loading completes.
  void loadWaypoints();

  async function onPositionUpdate(update: PositionUpdate): Promise<void> {
    if (!loaded || waypoints.length === 0) return;

    // Positioning mode management.
    if (update.accuracy > GPS_ACCURACY_PDR_TRIGGER_M) {
      if (state.positioningMode === 'gps') {
        state.positioningMode = 'pdr';
        callbacks.onPositioningModeChange('pdr');
      }
    } else {
      if (state.positioningMode === 'pdr') {
        state.positioningMode = 'gps';
        state.pdrDistanceM = 0;
        callbacks.onPositioningModeChange('gps');
      }
    }

    if (state.currentWaypointIndex >= waypoints.length) return;

    const target = waypoints[state.currentWaypointIndex];

    // PDR distance accumulation — cap at 80m before requiring GPS re-acq.
    if (state.positioningMode === 'pdr') {
      const prev = state.currentWaypointIndex > 0
        ? waypoints[state.currentWaypointIndex - 1]
        : null;
      if (prev) {
        state.pdrDistanceM += haversineDistanceM(prev.lat, prev.lng, update.lat, update.lng);
        if (state.pdrDistanceM >= PDR_MAX_DISTANCE_M) {
          callbacks.onGpsReacquisitionNeeded();
          return;
        }
      }
    }

    const distToTarget = haversineDistanceM(update.lat, update.lng, target.lat, target.lng);

    // Waypoint arrival.
    if (distToTarget < WAYPOINT_ARRIVAL_RADIUS_M) {
      callbacks.onWaypointArrived(target);
      state.currentWaypointIndex += 1;
      state.consecutiveDeviationCount = 0;
      state.pdrDistanceM = 0;

      if (state.currentWaypointIndex >= waypoints.length) {
        callbacks.onRouteCompleted();
      }
      return;
    }

    // Heading correction — 3 consecutive readings above threshold trigger haptic.
    const bearing = bearingTo(update.lat, update.lng, target.lat, target.lng);
    const headingError = normalizeAngle(bearing - update.heading);

    if (Math.abs(headingError) > HEADING_DEVIATION_THRESHOLD_DEG) {
      state.consecutiveDeviationCount += 1;
      if (state.consecutiveDeviationCount >= HEADING_DEVIATION_CONSECUTIVE) {
        callbacks.onHapticCorrection(headingError);
        state.consecutiveDeviationCount = 0;
      }
    } else {
      state.consecutiveDeviationCount = 0;
    }
  }

  return {
    onPositionUpdate,
    getState: (): Readonly<NavigationLoopState> => ({ ...state }),
    /**
     * Returns the current target waypoint, or null when the route is complete.
     */
    getCurrentWaypoint: (): LocalWaypoint | null =>
      waypoints[state.currentWaypointIndex] ?? null,
  };
}

// ── Geo helpers ────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two WGS-84 points in metres (Haversine). */
export function haversineDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Bearing from point A to point B in degrees (0° = north, clockwise). */
export function bearingTo(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Normalizes a bearing difference to the range [-180, 180]. */
export function normalizeAngle(degrees: number): number {
  let d = degrees % 360;
  if (d > 180)  d -= 360;
  if (d < -180) d += 360;
  return d;
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }
function toDeg(rad: number): number { return (rad * 180) / Math.PI; }
