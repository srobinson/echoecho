/**
 * ALP-948: Automatic waypoint detection from GPS heading changes.
 *
 * Analyses a stream of TrackPoints from the GPS recording service and emits
 * waypoint candidates at detected turns and fixed distance intervals.
 *
 * Stateless API — call processTrackPoint() for each incoming point and carry
 * forward the returned state. This makes the algorithm testable without React.
 *
 * Platform note: if compass heading from expo-sensors is ever blended in at low
 * speed, normalize accelerometer axes first. expo-sensors axes are inverted
 * between iOS and Android (expo-sensors#19229). This service uses GPS heading
 * only; the null-heading contract from ALP-947 handles the low-speed case.
 */
import { computeDistance } from '@echoecho/shared';
import type { TrackPoint } from '@echoecho/shared';

export interface WaypointDetectionConfig {
  /** Heading deviation threshold in degrees to trigger turn detection. Default: 20 */
  headingThresholdDegrees: number;
  /** Number of consecutive above-threshold samples required to confirm a turn. Default: 3 */
  sustainedSamples: number;
  /** Insert a waypoint every N metres on segments without detected turns. Default: 50 */
  fixedIntervalMeters: number;
  /** Minimum metres between any two waypoints (debounce). Default: 10 */
  minWaypointSpacingMeters: number;
}

export const DEFAULT_CONFIG: Required<WaypointDetectionConfig> = {
  headingThresholdDegrees: 20,
  sustainedSamples: 3,
  fixedIntervalMeters: 50,
  minWaypointSpacingMeters: 10,
};

export interface DetectedWaypoint {
  trackPointIndex: number;
  reason: 'turn' | 'distance';
  coordinate: { latitude: number; longitude: number; altitude: number | null };
  timestamp: number;
}

export interface WaypointDetectionState {
  /** Last three valid (non-flagged, non-null-heading) heading values for rolling average. */
  headingWindow: number[];
  /**
   * Stable reference heading locked when the straight segment was confirmed.
   * Only advances after `sustainedSamples` consecutive below-threshold readings,
   * preventing reference drift during gradual turns.
   */
  referenceHeading: number | null;
  /** Consecutive above-threshold samples in the current potential turn. */
  aboveThresholdCount: number;
  /**
   * Consecutive below-threshold samples since the last above-threshold reading.
   * Reference heading advances only when this reaches `sustainedSamples`.
   */
  consecutiveStraightCount: number;
  /** Coordinate of the most recently inserted waypoint (for spacing enforcement). */
  lastWaypointCoord: { latitude: number; longitude: number } | null;
  /** Accumulated metres since the last waypoint (for fixed-interval detection). */
  distanceSinceLastWaypoint: number;
  /** Last position used for distance accumulation (non-flagged points only). */
  lastTrackedCoord: { latitude: number; longitude: number } | null;
}

export function createWaypointDetectionState(): WaypointDetectionState {
  return {
    headingWindow: [],
    referenceHeading: null,
    aboveThresholdCount: 0,
    consecutiveStraightCount: 0,
    lastWaypointCoord: null,
    distanceSinceLastWaypoint: 0,
    lastTrackedCoord: null,
  };
}

/** Signed angular difference in [-180, 180]. */
function angularDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/** Circular mean of up to N headings (handles 359→1 wraparound). */
function smoothHeadings(headings: number[]): number {
  if (headings.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const h of headings) {
    const rad = (h * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const avg = (Math.atan2(sinSum / headings.length, cosSum / headings.length) * 180) / Math.PI;
  return (avg + 360) % 360;
}

/**
 * Process a single incoming TrackPoint through the waypoint detection state machine.
 *
 * Returns the (possibly updated) state and an optional detected waypoint.
 * If a turn waypoint and a distance waypoint would coincide within 5 m, the
 * distance waypoint is suppressed in favour of the turn waypoint.
 */
export function processTrackPoint(
  point: TrackPoint,
  state: WaypointDetectionState,
  config: Required<WaypointDetectionConfig> = DEFAULT_CONFIG,
): { waypoint: DetectedWaypoint | null; state: WaypointDetectionState } {
  let s = { ...state, headingWindow: [...state.headingWindow] };
  let candidate: DetectedWaypoint | null = null;

  // ── Distance accumulation (non-flagged points only) ──────────────────────
  if (!point.flagged) {
    if (s.lastTrackedCoord !== null) {
      s.distanceSinceLastWaypoint += computeDistance(s.lastTrackedCoord, point);
    }
    s.lastTrackedCoord = { latitude: point.latitude, longitude: point.longitude };
  }

  // ── Fixed-distance waypoint check ────────────────────────────────────────
  if (s.distanceSinceLastWaypoint >= config.fixedIntervalMeters) {
    const tooClose =
      s.lastWaypointCoord !== null &&
      computeDistance(s.lastWaypointCoord, point) < config.minWaypointSpacingMeters;

    if (!tooClose) {
      candidate = {
        trackPointIndex: point.sequenceIndex,
        reason: 'distance',
        coordinate: {
          latitude: point.latitude,
          longitude: point.longitude,
          altitude: point.altitude,
        },
        timestamp: point.timestamp,
      };
      s.lastWaypointCoord = { latitude: point.latitude, longitude: point.longitude };
      s.distanceSinceLastWaypoint = 0;
      // Reset heading tracking at new waypoint
      s.headingWindow = [];
      s.referenceHeading = null;
      s.aboveThresholdCount = 0;
      s.consecutiveStraightCount = 0;
    }
  }

  // ── Heading analysis (non-flagged, non-null-heading points only) ──────────
  if (!point.flagged && point.heading !== null) {
    s.headingWindow = [...s.headingWindow.slice(-2), point.heading];

    if (s.headingWindow.length >= 3) {
      const smoothed = smoothHeadings(s.headingWindow);

      if (s.referenceHeading === null) {
        s.referenceHeading = smoothed;
        s.consecutiveStraightCount = config.sustainedSamples; // seed as stable
      } else {
        const deviation = Math.abs(angularDiff(smoothed, s.referenceHeading));

        if (deviation > config.headingThresholdDegrees) {
          s.aboveThresholdCount++;
          s.consecutiveStraightCount = 0;

          if (s.aboveThresholdCount >= config.sustainedSamples) {
            const tooClose =
              s.lastWaypointCoord !== null &&
              computeDistance(s.lastWaypointCoord, point) < config.minWaypointSpacingMeters;

            if (!tooClose) {
              const suppressDistanceCandidate =
                candidate !== null &&
                candidate.reason === 'distance' &&
                computeDistance(
                  {
                    latitude: candidate.coordinate.latitude,
                    longitude: candidate.coordinate.longitude,
                  },
                  point,
                ) < 5;

              if (suppressDistanceCandidate) {
                candidate = null;
              }

              candidate = {
                trackPointIndex: point.sequenceIndex,
                reason: 'turn',
                coordinate: {
                  latitude: point.latitude,
                  longitude: point.longitude,
                  altitude: point.altitude,
                },
                timestamp: point.timestamp,
              };
              s.lastWaypointCoord = { latitude: point.latitude, longitude: point.longitude };
              s.distanceSinceLastWaypoint = 0;
              s.referenceHeading = smoothed;
              s.aboveThresholdCount = 0;
      s.consecutiveStraightCount = 0;
              s.consecutiveStraightCount = 0;
            }
          }
        } else {
          // Below threshold: reset above-threshold count.
          // Advance reference heading only after sustainedSamples consecutive
          // straight readings — prevents reference drift during gradual turns.
          s.aboveThresholdCount = 0;
      s.consecutiveStraightCount = 0;
          s.consecutiveStraightCount++;
          if (s.consecutiveStraightCount >= config.sustainedSamples) {
            s.referenceHeading = smoothed;
          }
        }
      }
    }
  }

  return { waypoint: candidate, state: s };
}

/**
 * Batch-process an entire TrackPoint array.
 * Useful for reprocessing a completed recording with adjusted config.
 */
export function detectWaypoints(
  points: TrackPoint[],
  config: Required<WaypointDetectionConfig> = DEFAULT_CONFIG,
): DetectedWaypoint[] {
  let state = createWaypointDetectionState();
  const waypoints: DetectedWaypoint[] = [];

  for (const point of points) {
    const result = processTrackPoint(point, state, config);
    state = result.state;
    if (result.waypoint) {
      waypoints.push(result.waypoint);
    }
  }

  return waypoints;
}
