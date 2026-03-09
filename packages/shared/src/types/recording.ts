import type { GeoPoint, CoordinateWithAltitude } from './geo';
import type { WaypointType, HazardType, HazardSeverity } from './route';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'complete';

/**
 * Live track point captured during walk-and-record. Raw data, pre-simplification.
 *
 * flagged=true when accuracy > 20m. ALP-948 skips flagged/null-heading points
 * in turn detection but retains them in the raw buffer.
 * heading is null when speed < 0.5 m/s (GPS heading is unreliable at low speed).
 */
export interface TrackPoint extends GeoPoint {
  sequenceIndex: number;
  /** True when GPS accuracy > 20m. Retained in buffer but skipped by ALP-948. */
  flagged?: boolean;
}

/**
 * Pending waypoint annotation queued during recording before route save.
 */
export interface PendingWaypoint {
  localId: string;
  coordinate: CoordinateWithAltitude;
  type: WaypointType;
  audioLabel: string | null;
  description: string | null;
  photoUri: string | null;
  audioAnnotationUri: string | null;
  capturedAt: number; // Unix ms
}

/**
 * Pending hazard annotation queued during recording.
 */
export interface PendingHazard {
  localId: string;
  coordinate: CoordinateWithAltitude;
  type: HazardType;
  severity: HazardSeverity;
  title: string;
  description: string | null;
  capturedAt: number; // Unix ms
}

/**
 * Full in-progress recording session state (held in device memory).
 */
export interface RecordingSession {
  localId: string;
  campusId: string;
  fromLabel: string;
  toLabel: string;
  state: RecordingState;
  trackPoints: TrackPoint[];
  pendingWaypoints: PendingWaypoint[];
  pendingHazards: PendingHazard[];
  startedAt: number;      // Unix ms
  pausedAt: number | null;
  totalPausedMs: number;
}
