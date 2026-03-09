/**
 * Haptic timing data for all four candidate encoding schemes.
 *
 * Timing format is compatible with the react-native-haptic-patterns
 * RecordedEventType shape so the player can be swapped if that library
 * is adopted. Until then, the pattern player uses expo-haptics + setTimeout.
 *
 * Source: docs/haptic-timing-reference.md, ALP-973 research
 * Used by: ALP-974 (test harness), ALP-958 (production haptic engine)
 */

/** A single event in a haptic pattern. */
export interface HapticTimingEvent {
  /** Milliseconds from pattern start at which this event fires. */
  startTime: number;
  /** Milliseconds from pattern start at which this event ends. */
  endTime: number;
  /** If true, this is a silence gap; the player does nothing at startTime. */
  isPause: boolean;
}

export type HapticTimingPattern = HapticTimingEvent[];

// ─────────────────────────────────────────────────────────────────────────────
// Scheme 1: Sequential Pulse Counting
// 1 pulse = straight, 2 pulses = left, 3 pulses = right
// ─────────────────────────────────────────────────────────────────────────────

export const S1_STRAIGHT: HapticTimingPattern = [
  { startTime: 0, endTime: 120, isPause: false },
];

export const S1_LEFT: HapticTimingPattern = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 250, isPause: true  },
  { startTime: 250, endTime: 370, isPause: false },
];

export const S1_RIGHT: HapticTimingPattern = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 250, isPause: true  },
  { startTime: 250, endTime: 370, isPause: false },
  { startTime: 370, endTime: 500, isPause: true  },
  { startTime: 500, endTime: 620, isPause: false },
];

export const S1_ARRIVED: HapticTimingPattern = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 220, isPause: true  },
  { startTime: 220, endTime: 340, isPause: false },
  { startTime: 340, endTime: 440, isPause: true  },
  { startTime: 440, endTime: 560, isPause: false },
  { startTime: 560, endTime: 660, isPause: true  },
  { startTime: 660, endTime: 780, isPause: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scheme 2: Duration Encoding
// short = straight, medium = left, long = right
// On iOS the player approximates via ImpactFeedbackStyle; Android uses
// Vibration.vibrate() which supports precise duration.
// ─────────────────────────────────────────────────────────────────────────────

export const S2_STRAIGHT: HapticTimingPattern = [
  { startTime: 0, endTime: 80, isPause: false },
];

export const S2_LEFT: HapticTimingPattern = [
  { startTime: 0, endTime: 250, isPause: false },
];

export const S2_RIGHT: HapticTimingPattern = [
  { startTime: 0, endTime: 480, isPause: false },
];

export const S2_APPROACHING: HapticTimingPattern = [
  { startTime: 0,   endTime: 80,  isPause: false },
  { startTime: 80,  endTime: 200, isPause: true  },
  { startTime: 200, endTime: 280, isPause: false },
];

export const S2_ARRIVED: HapticTimingPattern = [
  { startTime: 0,   endTime: 480,  isPause: false },
  { startTime: 480, endTime: 700,  isPause: true  },
  { startTime: 700, endTime: 1180, isPause: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scheme 3: Rhythm-Based (provisional winner from literature)
// march = straight, fast-slow (da-dum) = left, slow-fast-fast (da-dum-dum) = right
// Source: PMC 2022 n=30 dual-task vibrotactile study
// ─────────────────────────────────────────────────────────────────────────────

/** Steady march feel: three evenly spaced pulses. */
export const S3_STRAIGHT: HapticTimingPattern = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 300, isPause: true  },
  { startTime: 300, endTime: 400, isPause: false },
  { startTime: 400, endTime: 600, isPause: true  },
  { startTime: 600, endTime: 700, isPause: false },
];

/** Fast-slow asymmetric: da-dum. */
export const S3_LEFT: HapticTimingPattern = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 200, isPause: true  },
  { startTime: 200, endTime: 400, isPause: false },
];

/** Slow-fast-fast: da...dum-dum. */
export const S3_RIGHT: HapticTimingPattern = [
  { startTime: 0,   endTime: 200, isPause: false },
  { startTime: 200, endTime: 350, isPause: true  },
  { startTime: 350, endTime: 450, isPause: false },
  { startTime: 450, endTime: 500, isPause: true  },
  { startTime: 500, endTime: 600, isPause: false },
];

/** Single long pulse: approaching landmark. */
export const S3_APPROACHING: HapticTimingPattern = [
  { startTime: 0, endTime: 200, isPause: false },
];

/** Long pulse + rapid triple: arrival fanfare. */
export const S3_ARRIVED: HapticTimingPattern = [
  { startTime: 0,   endTime: 300, isPause: false },
  { startTime: 300, endTime: 420, isPause: true  },
  { startTime: 420, endTime: 520, isPause: false },
  { startTime: 520, endTime: 580, isPause: true  },
  { startTime: 580, endTime: 680, isPause: false },
  { startTime: 680, endTime: 740, isPause: true  },
  { startTime: 740, endTime: 840, isPause: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scheme 4: Proximity Intensity Ramp
// Used as a continuous interval loop: FAR=2000ms, MEDIUM=1000ms, CLOSE=500ms.
// The directional cue (from S1/S2/S3) fires once at segment start, then the
// proximity loop starts. The test harness fires proximity states on command.
// ─────────────────────────────────────────────────────────────────────────────

/** Fired every 2000ms when target is far. */
export const S4_FAR: HapticTimingPattern = [
  { startTime: 0, endTime: 80, isPause: false },
];

/** Fired every 1000ms when target is medium distance. */
export const S4_MEDIUM: HapticTimingPattern = [
  { startTime: 0, endTime: 100, isPause: false },
];

/** Fired every 500ms when target is close. */
export const S4_CLOSE: HapticTimingPattern = [
  { startTime: 0, endTime: 120, isPause: false },
];

/** Fired every 300ms when target is imminent. */
export const S4_IMMINENT: HapticTimingPattern = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 200, isPause: true  },
  { startTime: 200, endTime: 300, isPause: false },
];

/** Single long pulse: destination reached. */
export const S4_ARRIVED: HapticTimingPattern = [
  { startTime: 0, endTime: 600, isPause: false },
];

/** Interval (ms) between repetitions of each S4 proximity state. */
export const S4_INTERVALS = {
  FAR:      2000,
  MEDIUM:   1000,
  CLOSE:    500,
  IMMINENT: 300,
} as const;

export type S4ProximityState = keyof typeof S4_INTERVALS;

// ─────────────────────────────────────────────────────────────────────────────
// Named scheme groups (for the test harness UI and the production engine)
// ─────────────────────────────────────────────────────────────────────────────

export type SchemeCueName =
  | 'STRAIGHT'
  | 'LEFT'
  | 'RIGHT'
  | 'ARRIVED'
  | 'APPROACHING';

export interface SchemeDefinition {
  id: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  cues: Partial<Record<SchemeCueName, HapticTimingPattern>>;
}

export const HAPTIC_SCHEMES: SchemeDefinition[] = [
  {
    id: 1,
    name: 'Pulse Count',
    description: '1=straight  2=left  3=right',
    cues: {
      STRAIGHT: S1_STRAIGHT,
      LEFT:     S1_LEFT,
      RIGHT:    S1_RIGHT,
      ARRIVED:  S1_ARRIVED,
    },
  },
  {
    id: 2,
    name: 'Duration',
    description: 'short=straight  medium=left  long=right',
    cues: {
      STRAIGHT:    S2_STRAIGHT,
      LEFT:        S2_LEFT,
      RIGHT:       S2_RIGHT,
      APPROACHING: S2_APPROACHING,
      ARRIVED:     S2_ARRIVED,
    },
  },
  {
    id: 3,
    name: 'Rhythm',
    description: 'march=straight  da-dum=left  da..dum-dum=right',
    cues: {
      STRAIGHT:    S3_STRAIGHT,
      LEFT:        S3_LEFT,
      RIGHT:       S3_RIGHT,
      APPROACHING: S3_APPROACHING,
      ARRIVED:     S3_ARRIVED,
    },
  },
  {
    id: 4,
    name: 'Proximity Ramp',
    description: 'Continuous interval loop — closer = faster',
    // Scheme 4 uses loop API for FAR/MEDIUM/CLOSE/IMMINENT; ARRIVED is discrete.
    cues: {
      ARRIVED: S4_ARRIVED,
    },
  },
];
