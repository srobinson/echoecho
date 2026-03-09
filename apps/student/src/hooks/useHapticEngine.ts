/**
 * Turn-by-turn haptic feedback engine (ALP-958).
 *
 * Translates NavEvents from ALP-956 into device vibration using Scheme 3
 * (Rhythm-Based) patterns from the ALP-975 user study provisional recommendation.
 * Pattern map is runtime-configurable (JSON-loadable) per spec.
 *
 * Key behaviors:
 *   - FIFO queue, max depth 2; off_route preempts immediately
 *   - STT mutex via SttSessionState from ALP-954 (iOS Taptic/dictation workaround)
 *   - Low Power Mode detection via expo-battery (iOS)
 *   - Android DND: detected via best-effort; TODO: native module for full support
 *   - iOS/Android pattern variants documented in default pattern map
 *
 * Pattern playback uses expo-haptics (iOS impactAsync) and Vibration (Android)
 * directly. startTime/endTime in RecordedEventType are milliseconds.
 */
import { useCallback, useRef, useEffect } from 'react';
import { Platform, AccessibilityInfo, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Battery from 'expo-battery';

/** Timing event for a haptic pattern. */
export interface RecordedEventType {
  startTime: number;
  endTime: number;
  isPause: boolean;
}
import type { NavEvent } from '../types/navEvents';
import type { SttSessionState } from '@echoecho/shared';

// ── Pattern types ─────────────────────────────────────────────────────────────

export type HapticPatternKey = 'turn_left' | 'turn_right' | 'go_straight' | 'approaching_turn' | 'off_route' | 'arrived';
export type PatternMap = Record<HapticPatternKey, RecordedEventType[]>;

// ── Default pattern map — Scheme 3 Rhythm-Based (ALP-975 provisional) ────────
//
// iOS timing (Core Haptics, accurate): patterns as specified in research doc.
// Android timing (+20ms pauses per research doc recommendation for motor latency):
//   See ANDROID_PATTERN_MAP below.
//
// Timing in milliseconds (library converts to seconds for Core Haptics).

/** iOS-specific rhythm patterns. */
const IOS_PATTERN_MAP: PatternMap = {
  // Three even pulses — "march" feel
  go_straight: [
    { startTime: 0,   endTime: 100, isPause: false },
    { startTime: 100, endTime: 300, isPause: true  },
    { startTime: 300, endTime: 400, isPause: false },
    { startTime: 400, endTime: 600, isPause: true  },
    { startTime: 600, endTime: 700, isPause: false },
  ],
  // Quick double — "da-dum" fast-slow asymmetric
  turn_left: [
    { startTime: 0,   endTime: 100, isPause: false },
    { startTime: 100, endTime: 200, isPause: true  },
    { startTime: 200, endTime: 400, isPause: false },
  ],
  // Slow double then quick — "da...dum-dum" slow-fast asymmetric
  turn_right: [
    { startTime: 0,   endTime: 200, isPause: false },
    { startTime: 200, endTime: 350, isPause: true  },
    { startTime: 350, endTime: 450, isPause: false },
    { startTime: 450, endTime: 500, isPause: true  },
    { startTime: 500, endTime: 600, isPause: false },
  ],
  // Single advisory pulse
  approaching_turn: [
    { startTime: 0, endTime: 200, isPause: false },
  ],
  // Rapid repeated short — distinct alert character
  off_route: [
    { startTime: 0,   endTime: 150, isPause: false },
    { startTime: 150, endTime: 220, isPause: true  },
    { startTime: 220, endTime: 370, isPause: false },
    { startTime: 370, endTime: 440, isPause: true  },
    { startTime: 440, endTime: 590, isPause: false },
  ],
  // Long + rapid triple — distinct from all directional signals
  arrived: [
    { startTime: 0,   endTime: 300, isPause: false },
    { startTime: 300, endTime: 420, isPause: true  },
    { startTime: 420, endTime: 520, isPause: false },
    { startTime: 520, endTime: 580, isPause: true  },
    { startTime: 580, endTime: 680, isPause: false },
    { startTime: 680, endTime: 740, isPause: true  },
    { startTime: 740, endTime: 840, isPause: false },
  ],
};

/** Android patterns: pauses widened +20ms for motor response latency. */
const ANDROID_PATTERN_MAP: PatternMap = {
  go_straight: [
    { startTime: 0,   endTime: 100, isPause: false },
    { startTime: 100, endTime: 320, isPause: true  },
    { startTime: 320, endTime: 420, isPause: false },
    { startTime: 420, endTime: 620, isPause: true  },
    { startTime: 620, endTime: 720, isPause: false },
  ],
  turn_left: [
    { startTime: 0,   endTime: 100, isPause: false },
    { startTime: 100, endTime: 220, isPause: true  },
    { startTime: 220, endTime: 420, isPause: false },
  ],
  turn_right: [
    { startTime: 0,   endTime: 200, isPause: false },
    { startTime: 200, endTime: 370, isPause: true  },
    { startTime: 370, endTime: 470, isPause: false },
    { startTime: 470, endTime: 520, isPause: true  },
    { startTime: 520, endTime: 620, isPause: false },
  ],
  approaching_turn: [
    { startTime: 0, endTime: 200, isPause: false },
  ],
  off_route: [
    { startTime: 0,   endTime: 150, isPause: false },
    { startTime: 150, endTime: 240, isPause: true  },
    { startTime: 240, endTime: 390, isPause: false },
    { startTime: 390, endTime: 460, isPause: true  },
    { startTime: 460, endTime: 610, isPause: false },
  ],
  arrived: [
    { startTime: 0,   endTime: 300, isPause: false },
    { startTime: 300, endTime: 440, isPause: true  },
    { startTime: 440, endTime: 540, isPause: false },
    { startTime: 540, endTime: 600, isPause: true  },
    { startTime: 600, endTime: 700, isPause: false },
    { startTime: 700, endTime: 760, isPause: true  },
    { startTime: 760, endTime: 860, isPause: false },
  ],
};

const DEFAULT_PATTERN_MAP: PatternMap =
  Platform.OS === 'ios' ? IOS_PATTERN_MAP : ANDROID_PATTERN_MAP;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_QUEUE_DEPTH = 2;

function durationToImpactStyle(durationMs: number): Haptics.ImpactFeedbackStyle {
  if (durationMs <= 120) return Haptics.ImpactFeedbackStyle.Light;
  if (durationMs <= 300) return Haptics.ImpactFeedbackStyle.Medium;
  return Haptics.ImpactFeedbackStyle.Heavy;
}

/**
 * Play a recorded haptic pattern using expo-haptics (iOS) or Vibration (Android).
 * Resolves when the pattern finishes.
 */
function playRecordedPattern(events: RecordedEventType[]): Promise<void> {
  const totalMs = events.length > 0 ? events[events.length - 1].endTime : 0;
  if (totalMs === 0) return Promise.resolve();

  if (Platform.OS === 'android') {
    const androidPat: number[] = [];
    let cursor = 0;
    for (const event of events) {
      if (event.isPause) { cursor = event.endTime; continue; }
      const gap = event.startTime - cursor;
      const duration = event.endTime - event.startTime;
      androidPat.push(gap > 0 ? gap : 0);
      androidPat.push(duration);
      cursor = event.endTime;
    }
    if (androidPat.length > 0) Vibration.vibrate(androidPat);
    return new Promise((resolve) => setTimeout(resolve, totalMs));
  }

  // iOS: schedule each vibration event via setTimeout
  return new Promise((resolve) => {
    const vibratingEvents = events.filter((e) => !e.isPause);
    for (const event of vibratingEvents) {
      const style = durationToImpactStyle(event.endTime - event.startTime);
      setTimeout(() => { Haptics.impactAsync(style).catch(() => {}); }, event.startTime);
    }
    setTimeout(resolve, totalMs);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseHapticEngineResult {
  /** Process a NavEvent from ALP-956. */
  onNavEvent: (event: NavEvent) => void;
  /** Load a custom pattern map from JSON (overrides defaults). */
  loadPatternMap: (map: PatternMap) => void;
  /** Callback notified when haptic is skipped (Low Power / DND). */
  onHapticSkipped: (cb: (reason: 'low_power' | 'dnd') => void) => void;
}

export function useHapticEngine(
  sttState: SttSessionState | null
): UseHapticEngineResult {
  const patternMapRef = useRef<PatternMap>(DEFAULT_PATTERN_MAP);
  const queueRef = useRef<HapticPatternKey[]>([]);
  const playingRef = useRef(false);
  const lowPowerRef = useRef(false);
  const skipCallbackRef = useRef<((reason: 'low_power' | 'dnd') => void) | null>(null);
  const lowPowerAnnouncedRef = useRef(false);

  // Low Power Mode detection — expo-battery
  useEffect(() => {
    let sub: Battery.Subscription;

    const init = async () => {
      if (Platform.OS !== 'ios') return;
      try {
        lowPowerRef.current = await Battery.isLowPowerModeEnabledAsync();
        sub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
          const wasActive = lowPowerRef.current;
          lowPowerRef.current = lowPowerMode;
          if (lowPowerMode && !wasActive && !lowPowerAnnouncedRef.current) {
            lowPowerAnnouncedRef.current = true;
            AccessibilityInfo.announceForAccessibility(
              'Haptic feedback unavailable in Low Power Mode.'
            );
          }
          if (!lowPowerMode) {
            lowPowerAnnouncedRef.current = false;
          }
        });
      } catch {
        // expo-battery unavailable; default to haptics enabled
      }
    };

    void init();
    return () => { sub?.remove(); };
  }, []);

  const firePattern = useCallback(async (key: HapticPatternKey) => {
    if (lowPowerRef.current && Platform.OS === 'ios') {
      skipCallbackRef.current?.('low_power');
      return;
    }

    // TODO: Android DND detection requires a native module
    // (NotificationManager.getCurrentInterruptionFilter). When implemented,
    // check here and call skipCallbackRef.current?.('dnd') if suppressed.

    const pattern = patternMapRef.current[key];

    // STT mutex — iOS Taptic Engine is silenced during active dictation.
    // requestPause() resolves when the STT session confirms its pause
    // (via pauseResolverRef in useSttDestination), so no polling needed.
    if (sttState?.isActive) {
      await sttState.requestPause();
    }

    try {
      await playRecordedPattern(pattern);
    } catch {
      // Native haptic failure — silent fallback (audio engine compensates)
    } finally {
      sttState?.resume();
    }
  }, [sttState]);

  const drainQueue = useCallback(async () => {
    if (playingRef.current || queueRef.current.length === 0) return;
    playingRef.current = true;
    const key = queueRef.current.shift()!;
    await firePattern(key);
    playingRef.current = false;
    // Drain next if anything queued during playback
    void drainQueue();
  }, [firePattern]);

  const enqueue = useCallback((key: HapticPatternKey, preempt = false) => {
    if (preempt) {
      queueRef.current = [key];
      playingRef.current = false;
    } else {
      if (queueRef.current.length >= MAX_QUEUE_DEPTH) {
        queueRef.current.shift(); // drop oldest non-critical
      }
      queueRef.current.push(key);
    }
    void drainQueue();
  }, [drainQueue]);

  const onNavEvent = useCallback((event: NavEvent) => {
    switch (event.type) {
      case 'approaching_waypoint':
        enqueue('approaching_turn');
        break;
      case 'at_waypoint':
        if (event.turnDirection === 'left')    enqueue('turn_left');
        else if (event.turnDirection === 'right')   enqueue('turn_right');
        else if (event.turnDirection === 'straight') enqueue('go_straight');
        else if (event.turnDirection === 'arrived')  enqueue('arrived');
        break;
      case 'arrived':
        enqueue('arrived');
        break;
      case 'off_route':
        enqueue('off_route', true); // preempts queue
        break;
      default:
        break;
    }
  }, [enqueue]);

  const loadPatternMap = useCallback((map: PatternMap) => {
    patternMapRef.current = map;
  }, []);

  const onHapticSkipped = useCallback((cb: (reason: 'low_power' | 'dnd') => void) => {
    skipCallbackRef.current = cb;
  }, []);

  return { onNavEvent, loadPatternMap, onHapticSkipped };
}
