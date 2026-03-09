import type { CoordinateWithAltitude } from './geo';

export type RouteStatus = 'pending_save' | 'draft' | 'published' | 'retracted';

export type WaypointType =
  | 'start'
  | 'end'
  | 'turn'
  | 'decision_point'
  | 'landmark'
  | 'hazard'
  | 'door'
  | 'elevator'
  | 'stairs'
  | 'ramp'
  | 'crossing'
  | 'regular';

export type HazardSeverity = 'low' | 'medium' | 'high';

export type HazardType =
  | 'uneven_surface'
  | 'construction'
  | 'stairs_unmarked'
  | 'low_clearance'
  | 'seasonal'
  | 'wet_surface'
  | 'other';

/**
 * A named point along a route with rich accessibility metadata.
 */
export interface Waypoint {
  id: string;
  routeId: string;
  sequenceIndex: number;
  coordinate: CoordinateWithAltitude;
  type: WaypointType;
  /** Heading the user should be facing when leaving this waypoint (0-359) */
  headingOut: number | null;
  /** Short label read aloud to the student */
  audioLabel: string | null;
  /** Longer description for screen readers / detailed guidance */
  description: string | null;
  /** Photo snapshot taken at recording time */
  photoUrl: string | null;
  /** Voice memo recorded at this waypoint */
  audioAnnotationUrl: string | null;
  createdAt: string;
}

/**
 * Hazard overlay — can be associated with a waypoint or free-floating.
 */
export interface Hazard {
  id: string;
  campusId: string;
  routeId: string | null;
  waypointId: string | null;
  type: HazardType;
  severity: HazardSeverity;
  coordinate: CoordinateWithAltitude;
  title: string;
  description: string | null;
  /** ISO 8601 — null means permanent */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A recorded path between two campus locations.
 */
export interface Route {
  id: string;
  campusId: string;
  name: string;
  description: string | null;
  fromBuildingId: string | null;
  toBuildingId: string | null;
  /** Human-readable origin label */
  fromLabel: string;
  /** Human-readable destination label */
  toLabel: string;
  status: RouteStatus;
  waypoints: Waypoint[];
  hazards: Hazard[];
  /** Duration recorded during walk-and-record (seconds) */
  recordedDurationSec: number | null;
  /** Total distance computed from waypoints (meters) */
  distanceMeters: number | null;
  /** O&M specialist or volunteer who recorded the route */
  recordedBy: string | null;
  recordedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRouteInput {
  campusId: string;
  name: string;
  description?: string;
  fromBuildingId?: string;
  toBuildingId?: string;
  fromLabel: string;
  toLabel: string;
}

export interface CreateWaypointInput {
  routeId: string;
  sequenceIndex: number;
  coordinate: CoordinateWithAltitude;
  type: WaypointType;
  headingOut?: number;
  audioLabel?: string;
  description?: string;
}

export interface CreateHazardInput {
  campusId: string;
  routeId?: string;
  waypointId?: string;
  type: HazardType;
  severity: HazardSeverity;
  coordinate: CoordinateWithAltitude;
  title: string;
  description?: string;
  expiresAt?: string;
}
