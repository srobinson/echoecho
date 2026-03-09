# Haptic Timing Reference — EchoEcho Navigator

Research artifacts: `~/.mdx/research/haptic-encoding-scheme-candidates.md`
Study design + protocol: `~/.mdx/research/haptic-user-study-results.md`

ALP-974 (test harness) and ALP-958 (haptic engine) should read the full candidate document.
This file contains the timing arrays in copy-paste form for immediate use.

---

## Library

`react-native-haptic-patterns` (SimformSolutionsPvtLtd)

```typescript
import HapticPatterns from 'react-native-haptic-patterns';

type HapticEvent = {
  startTime: number;  // ms from pattern start
  endTime: number;    // ms from pattern start
  isPause: boolean;   // true = silence, false = vibration
};

HapticPatterns.playPattern(pattern);
```

---

## Four Candidate Schemes

All four must be implemented in the ALP-974 test harness.

### Scheme 1: Sequential Pulse Counting (1=straight, 2=left, 3=right)

```typescript
export const S1_STRAIGHT: HapticEvent[] = [
  { startTime: 0, endTime: 120, isPause: false },
];

export const S1_LEFT: HapticEvent[] = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 250, isPause: true  },
  { startTime: 250, endTime: 370, isPause: false },
];

export const S1_RIGHT: HapticEvent[] = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 250, isPause: true  },
  { startTime: 250, endTime: 370, isPause: false },
  { startTime: 370, endTime: 500, isPause: true  },
  { startTime: 500, endTime: 620, isPause: false },
];

export const S1_ARRIVED: HapticEvent[] = [
  { startTime: 0,   endTime: 120, isPause: false },
  { startTime: 120, endTime: 220, isPause: true  },
  { startTime: 220, endTime: 340, isPause: false },
  { startTime: 340, endTime: 440, isPause: true  },
  { startTime: 440, endTime: 560, isPause: false },
  { startTime: 560, endTime: 660, isPause: true  },
  { startTime: 660, endTime: 780, isPause: false },
];
```

### Scheme 2: Duration Encoding (short=straight, medium=left, long=right)

```typescript
export const S2_STRAIGHT: HapticEvent[] = [
  { startTime: 0, endTime: 80, isPause: false },
];

export const S2_LEFT: HapticEvent[] = [
  { startTime: 0, endTime: 250, isPause: false },
];

export const S2_RIGHT: HapticEvent[] = [
  { startTime: 0, endTime: 480, isPause: false },
];

export const S2_APPROACHING: HapticEvent[] = [
  { startTime: 0,   endTime: 80,  isPause: false },
  { startTime: 80,  endTime: 200, isPause: true  },
  { startTime: 200, endTime: 280, isPause: false },
];

export const S2_ARRIVED: HapticEvent[] = [
  { startTime: 0,   endTime: 480, isPause: false },
  { startTime: 480, endTime: 700, isPause: true  },
  { startTime: 700, endTime: 1180, isPause: false },
];
```

### Scheme 3: Rhythm-Based Pattern (march=straight, fast-slow=left, slow-fast-fast=right)

```typescript
// STRAIGHT: steady march feel (three even pulses)
export const S3_STRAIGHT: HapticEvent[] = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 300, isPause: true  },
  { startTime: 300, endTime: 400, isPause: false },
  { startTime: 400, endTime: 600, isPause: true  },
  { startTime: 600, endTime: 700, isPause: false },
];

// LEFT: fast-slow asymmetric (da-dum)
export const S3_LEFT: HapticEvent[] = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 200, isPause: true  },
  { startTime: 200, endTime: 400, isPause: false },
];

// RIGHT: slow-fast-fast (da...dum-dum)
export const S3_RIGHT: HapticEvent[] = [
  { startTime: 0,   endTime: 200, isPause: false },
  { startTime: 200, endTime: 350, isPause: true  },
  { startTime: 350, endTime: 450, isPause: false },
  { startTime: 450, endTime: 500, isPause: true  },
  { startTime: 500, endTime: 600, isPause: false },
];

export const S3_APPROACHING: HapticEvent[] = [
  { startTime: 0, endTime: 200, isPause: false },
];

// ARRIVED: long pulse + rapid triple
export const S3_ARRIVED: HapticEvent[] = [
  { startTime: 0,   endTime: 300, isPause: false },
  { startTime: 300, endTime: 420, isPause: true  },
  { startTime: 420, endTime: 520, isPause: false },
  { startTime: 520, endTime: 580, isPause: true  },
  { startTime: 580, endTime: 680, isPause: false },
  { startTime: 680, endTime: 740, isPause: true  },
  { startTime: 740, endTime: 840, isPause: false },
];
```

### Scheme 4: Proximity Intensity Ramp (continuous; experimenter-triggered states)

ALP-974 harness must support manual experimenter triggering of proximity states,
independent of live GPS/PDR. See study protocol for why.

```typescript
// Fire on interval: FAR=every 2000ms, MEDIUM=every 1000ms, CLOSE=every 500ms
export const S4_FAR: HapticEvent[] = [
  { startTime: 0, endTime: 80, isPause: false },
];

export const S4_MEDIUM: HapticEvent[] = [
  { startTime: 0, endTime: 100, isPause: false },
];

export const S4_CLOSE: HapticEvent[] = [
  { startTime: 0, endTime: 120, isPause: false },
];

export const S4_IMMINENT: HapticEvent[] = [
  { startTime: 0,   endTime: 100, isPause: false },
  { startTime: 100, endTime: 200, isPause: true  },
  { startTime: 200, endTime: 300, isPause: false },
];

export const S4_ARRIVED: HapticEvent[] = [
  { startTime: 0, endTime: 600, isPause: false },
];

// Direction: fire one S1/S2/S3 directional cue at segment start, then proximity states
// Test harness must support: [DIRECTION_CUE] → [start proximity interval loop]
```

---

## iOS / Android Notes

- **iOS Low Power Mode / dictation**: All haptics are silenced during active STT sessions.
  The navigation engine must not fire haptic cues while voice recognition is open.
  Implement a mutex: queue cue → wait for STT deactivation → fire.
- **Android timing**: Consider adding 20ms to all pause durations on Android to account
  for vibration motor spin-down latency.
- **Android Scheme 4**: No amplitude control available. Frequency modulation (interval
  between bursts) is the only ramp approximation. Acceptable for the study.

---

## Provisional Recommendation (pending actual study data)

Literature-based projection: **Scheme 3 (Rhythm-Based)** is the provisional winner.
PMC 2022 (n=30) is the only study with a dual-task condition using vibrotactile rhythms:
82-90% seated accuracy, ~70% under secondary cognitive task.

Implement Scheme 3 as the default in ALP-958 (haptic engine) while study data is collected.
Override when actual participant data is available.

Full evidence base: `~/.mdx/research/haptic-encoding-scheme-candidates.md`
Full study protocol: `~/.mdx/research/haptic-user-study-results.md`
