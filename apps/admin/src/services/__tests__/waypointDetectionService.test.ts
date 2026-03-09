/**
 * Unit tests for ALP-948: automatic waypoint detection algorithm.
 * Tests cover acceptance criteria from the Linear issue.
 */
import {
  detectWaypoints,
  DEFAULT_CONFIG,
} from '../waypointDetectionService';
import type { WaypointDetectionConfig } from '../waypointDetectionService';
import type { TrackPoint } from '@echoecho/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePoint(
  lat: number,
  lng: number,
  heading: number | null,
  overrides: Partial<TrackPoint> = {},
  index?: number,
): TrackPoint {
  const seqIdx = index ?? 0;
  return {
    latitude: lat,
    longitude: lng,
    altitude: 0,
    altitudeAccuracy: null,
    accuracy: 5,
    heading,
    speed: 1.2,
    timestamp: Date.now() + seqIdx * 1000,
    sequenceIndex: seqIdx,
    flagged: false,
    ...overrides,
  };
}

/**
 * Generate a straight track pointing north (heading 0) for N points
 * spaced roughly `spacingM` metres apart (~0.00001 deg lat ≈ 1.11 m).
 */
function makeStraightTrack(points: number, spacingM = 1): TrackPoint[] {
  const latStep = (spacingM / 111_000);
  return Array.from({ length: points }, (_, i) =>
    makePoint(30.0 + i * latStep, -97.0, 0, {}, i),
  );
}

/**
 * Generate a track that turns 90° right (from heading 0 to heading 90) over
 * `turnPoints` samples, starting after `straightPoints` straight samples.
 */
function makeTurnTrack(straightPoints: number, turnPoints: number, spacingM = 2): TrackPoint[] {
  const latStep = (spacingM / 111_000);
  const track: TrackPoint[] = [];

  // Straight north segment
  for (let i = 0; i < straightPoints; i++) {
    track.push(makePoint(30.0 + i * latStep, -97.0, 0, {}, i));
  }

  // Turn segment: heading ramps from 0 to 90 over turnPoints samples
  const startLat = 30.0 + (straightPoints - 1) * latStep;
  for (let i = 0; i < turnPoints; i++) {
    const heading = (90 * i) / (turnPoints - 1);
    track.push(makePoint(startLat + i * latStep * 0.1, -97.0 + i * 0.00005, heading, {}, straightPoints + i));
  }

  return track;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('detectWaypoints', () => {
  describe('straight track — no false positives', () => {
    it('emits no turn waypoints on a straight heading-0 track', () => {
      const track = makeStraightTrack(60, 1);
      const waypoints = detectWaypoints(track, DEFAULT_CONFIG);
      const turns = waypoints.filter((w) => w.reason === 'turn');
      expect(turns).toHaveLength(0);
    });

    it('emits fixed-distance waypoints every 50 m on straight segments', () => {
      // 200 m track, 1 m spacing → expect ~3 fixed-distance waypoints (at 50, 100, 150 m)
      const track = makeStraightTrack(201, 1);
      const waypoints = detectWaypoints(track, DEFAULT_CONFIG);
      const distWaypoints = waypoints.filter((w) => w.reason === 'distance');
      expect(distWaypoints.length).toBeGreaterThanOrEqual(3);
      expect(distWaypoints.length).toBeLessThanOrEqual(4);
    });
  });

  describe('turn detection', () => {
    it('inserts a turn waypoint after a 90-degree turn with sustained samples', () => {
      // 30 straight points at 2 m, then 10-point 90° turn
      const track = makeTurnTrack(30, 10, 2);
      const config: Required<WaypointDetectionConfig> = { ...DEFAULT_CONFIG, fixedIntervalMeters: 200 };
      const waypoints = detectWaypoints(track, config);
      const turns = waypoints.filter((w) => w.reason === 'turn');
      expect(turns.length).toBeGreaterThanOrEqual(1);
    });

    it('does not detect a turn when heading deviation stays below threshold', () => {
      // Small oscillation ±10° around heading 0 — below 20° threshold
      const track = Array.from({ length: 40 }, (_, i) => {
        const heading = i % 2 === 0 ? 5 : 355; // oscillates ~10° — angular diff is ~10°
        return makePoint(30 + i * 0.00001, -97, heading, {}, i);
      });
      const config: Required<WaypointDetectionConfig> = { ...DEFAULT_CONFIG, fixedIntervalMeters: 500 };
      const waypoints = detectWaypoints(track, config);
      const turns = waypoints.filter((w) => w.reason === 'turn');
      expect(turns).toHaveLength(0);
    });
  });

  describe('minimum spacing enforcement', () => {
    it('enforces 10 m minimum spacing between any two waypoints', () => {
      // 200 m straight track with 5 m spacing, then a sharp turn immediately
      const config: Required<WaypointDetectionConfig> = {
        ...DEFAULT_CONFIG,
        fixedIntervalMeters: 10,
        minWaypointSpacingMeters: 10,
      };
      const track = makeStraightTrack(50, 5);
      const waypoints = detectWaypoints(track, config);

      for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i - 1].coordinate;
        const curr = waypoints[i].coordinate;
        const dLat = (curr.latitude - prev.latitude) * 111_000;
        const dLng = (curr.longitude - prev.longitude) * 111_000;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        expect(dist).toBeGreaterThanOrEqual(config.minWaypointSpacingMeters - 1); // 1 m tolerance
      }
    });
  });

  describe('flagged and null-heading samples', () => {
    it('skips flagged samples without breaking the algorithm', () => {
      const track = makeStraightTrack(60, 1).map((p, i) => ({
        ...p,
        flagged: i % 5 === 0, // every 5th point flagged
      }));
      expect(() => detectWaypoints(track, DEFAULT_CONFIG)).not.toThrow();
    });

    it('skips null-heading samples without breaking the algorithm', () => {
      const track = makeStraightTrack(60, 1).map((p, i) => ({
        ...p,
        heading: i % 3 === 0 ? null : p.heading,
      }));
      expect(() => detectWaypoints(track, DEFAULT_CONFIG)).not.toThrow();
    });

    it('emits no turn waypoints for a track with all null headings', () => {
      const track = makeStraightTrack(60, 1).map((p) => ({ ...p, heading: null }));
      const waypoints = detectWaypoints(track, DEFAULT_CONFIG);
      const turns = waypoints.filter((w) => w.reason === 'turn');
      expect(turns).toHaveLength(0);
    });
  });

  describe('configurable parameters', () => {
    it('respects custom fixedIntervalMeters', () => {
      const track = makeStraightTrack(201, 1);
      const config: Required<WaypointDetectionConfig> = { ...DEFAULT_CONFIG, fixedIntervalMeters: 100 };
      const waypoints = detectWaypoints(track, config);
      const distWaypoints = waypoints.filter((w) => w.reason === 'distance');
      // ~200 m track → ~2 waypoints at 100 m intervals
      expect(distWaypoints.length).toBeGreaterThanOrEqual(1);
      expect(distWaypoints.length).toBeLessThanOrEqual(2);
    });

    it('respects custom headingThresholdDegrees', () => {
      // 20 straight points then a 60-degree turn (12 deg/step over 5 steps).
      // Should not trigger at threshold=70deg but should at threshold=10deg.
      const baseTrack = makeStraightTrack(20, 2);
      const turnSegment = Array.from({ length: 8 }, (_, i) =>
        makePoint(
          baseTrack[baseTrack.length - 1].latitude + i * 0.00002,
          -97.0 + i * 0.00002,
          i * 12, // heading 0 to 84 degrees over 8 steps
          {},
          20 + i,
        ),
      );
      const combinedTrack = [...baseTrack, ...turnSegment];

      const highThreshold: Required<WaypointDetectionConfig> = {
        ...DEFAULT_CONFIG, headingThresholdDegrees: 90, fixedIntervalMeters: 500,
      };
      const lowThreshold: Required<WaypointDetectionConfig> = {
        ...DEFAULT_CONFIG, headingThresholdDegrees: 10, fixedIntervalMeters: 500,
      };

      const noTurns = detectWaypoints(combinedTrack, highThreshold).filter((w) => w.reason === 'turn');
      const hasTurns = detectWaypoints(combinedTrack, lowThreshold).filter((w) => w.reason === 'turn');

      expect(noTurns).toHaveLength(0);
      expect(hasTurns.length).toBeGreaterThan(0);
    });
  });
});
