import type { Coordinate, GeoPoint } from './geo';
import type { Route } from './route';

export type NavigationStatus =
  | 'idle'
  | 'searching'
  | 'navigating'
  | 'off_route'
  | 'arrived'
  | 'emergency';

export type PositioningMode = 'gps' | 'pdr' | 'unknown';

/**
 * Live navigation state during a student's trip.
 */
export interface NavigationSession {
  id: string;
  userId: string;
  route: Route;
  status: NavigationStatus;
  positioningMode: PositioningMode;
  currentPosition: GeoPoint | null;
  currentWaypointIndex: number;
  distanceToNextWaypoint: number | null; // meters
  bearingToNextWaypoint: number | null;  // degrees
  startedAt: string;
  arrivedAt: string | null;
}

/**
 * A single turn instruction computed from consecutive waypoints.
 */
export interface TurnInstruction {
  waypointId: string;
  sequenceIndex: number;
  /** Relative bearing: negative = left, positive = right, 0 = straight */
  relativeBearing: number;
  distanceMeters: number;
  audioText: string;
  hapticPattern: HapticPattern;
  landmark: string | null;
}

/**
 * Haptic encoding for directional guidance.
 * Patterns are abstract descriptors — the platform implementation
 * maps these to native haptic sequences.
 */
export type HapticPattern =
  | 'turn_left_sharp'
  | 'turn_left'
  | 'turn_left_slight'
  | 'straight'
  | 'turn_right_slight'
  | 'turn_right'
  | 'turn_right_sharp'
  | 'u_turn'
  | 'arrived'
  | 'hazard_warning'
  | 'off_route'
  | 'rerouting';

/**
 * Off-route detection result.
 */
export interface OffRouteEvent {
  sessionId: string;
  position: Coordinate;
  nearestWaypointIndex: number;
  deviationMeters: number;
  detectedAt: string;
}

/**
 * User's saved destination (favorites / history).
 */
export interface SavedDestination {
  id: string;
  userId: string;
  routeId: string;
  label: string;
  lastUsedAt: string;
  useCount: number;
}
