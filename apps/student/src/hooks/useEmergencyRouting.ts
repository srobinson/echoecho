/**
 * useEmergencyRouting — synchronous offline nearest-exit computation.
 *
 * ALP-962: Emergency routing must work without network. This hook is pure
 * synchronous geometry against pre-loaded building entrance data. No async,
 * no Mapbox Directions API call.
 *
 * Algorithm: Haversine distance from currentPosition to every entrance in
 * every building. O(n) over total entrance count — acceptable for campus
 * scale (< 200 entrances typically). Returns bearing + distance for the
 * nearest entrance, or the nearest security office waypoint if closer.
 *
 * Target: < 50ms on device (well within 200ms acceptance criterion).
 */

import { useMemo } from 'react';
import type { Entrance, Waypoint } from '@echoecho/shared';
import type { Coordinate } from '@echoecho/shared';
import { computeDistance, computeBearing } from '@echoecho/shared';

export interface NearestExit {
  /** Human-readable label for audio announcement */
  label: string;
  /** Distance from currentPosition in meters */
  distanceMeters: number;
  /** Bearing from currentPosition to exit (0 = North, clockwise) */
  bearing: number;
  /** Instruction text for the student */
  instruction: string;
  /** Whether this is a security office (vs building entrance) */
  isSecurity: boolean;
}

export interface EmergencyRoutingInput {
  currentPosition: Coordinate | null;
  /** All entrances from all pre-loaded buildings */
  entrances: Entrance[];
  /** Security office waypoints for the active campus */
  securityWaypoints: Waypoint[];
}

/**
 * Returns nearest exit result synchronously, or null if position unavailable.
 *
 * Memoized on (currentPosition, entrances, securityWaypoints) identity.
 * Re-runs only when position changes — stable on every render otherwise.
 */
export function useEmergencyRouting(input: EmergencyRoutingInput): NearestExit | null {
  const { currentPosition, entrances, securityWaypoints } = input;

  return useMemo(() => {
    if (!currentPosition) return null;

    let nearest: NearestExit | null = null;
    let nearestDist = Infinity;

    // Check all building entrances
    for (const entrance of entrances) {
      const dist = computeDistance(currentPosition, entrance.coordinate);
      if (dist < nearestDist) {
        nearestDist = dist;
        const bearing = computeBearing(currentPosition, entrance.coordinate);
        nearest = {
          label: entrance.name,
          distanceMeters: dist,
          bearing,
          instruction: buildInstruction(entrance.name, dist, bearing),
          isSecurity: false,
        };
      }
    }

    // Check security office waypoints — prefer security if closer
    for (const wp of securityWaypoints) {
      const coord: Coordinate = {
        latitude: wp.coordinate.latitude,
        longitude: wp.coordinate.longitude,
      };
      const dist = computeDistance(currentPosition, coord);
      if (dist < nearestDist) {
        nearestDist = dist;
        const bearing = computeBearing(currentPosition, coord);
        const label = wp.audioLabel ?? 'Security Office';
        nearest = {
          label,
          distanceMeters: dist,
          bearing,
          instruction: buildInstruction(label, dist, bearing),
          isSecurity: true,
        };
      }
    }

    return nearest;
  }, [
    currentPosition,
    entrances,
    securityWaypoints,
  ]);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildInstruction(label: string, distMeters: number, bearing: number): string {
  const dist = Math.round(distMeters);
  const direction = bearingToCardinal(bearing);
  if (dist < 10) {
    return `${label} is right here.`;
  }
  return `${label} — ${dist} meters ${direction}.`;
}

/**
 * Coarse cardinal direction from bearing for audio instruction.
 * 8-point compass is sufficient for emergency context.
 */
function bearingToCardinal(bearing: number): string {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const index = Math.round(bearing / 45) % 8;
  return dirs[index] ?? 'ahead';
}
