/**
 * Haptic pattern player for the EchoEcho admin app (test harness).
 *
 * SINGLETON: This module uses module-level mutable state intentionally.
 * A device has one vibration motor; concurrent haptic patterns from multiple
 * screens would produce garbled output. Callers must acquire/release
 * ownership via acquire(owner)/release(owner) before using play functions.
 * Calls to playPattern/startProximityLoop without ownership are no-ops.
 *
 * Plays HapticTimingPattern arrays using expo-haptics + setTimeout chains.
 * On iOS, each vibration event fires an impactAsync call; amplitude is
 * approximated from event duration (short=Light, medium=Medium, long=Heavy).
 * On Android, Vibration.vibrate() accepts a duration array for precise control.
 *
 * ALP-976: Implements the STT/haptic mutex.
 * When STT (speech-to-text) is active, cues are queued rather than fired.
 * The queue drains immediately when STT deactivates. Stale cues (older than
 * MAX_QUEUE_AGE_MS) are discarded silently to prevent a burst after a long
 * dictation session. This prevents the iOS dictation/haptic conflict documented
 * in docs/haptic-timing-reference.md.
 */

import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { HapticTimingPattern, HapticTimingEvent } from '@echoecho/shared';

// Discard queued cues older than this.
const MAX_QUEUE_AGE_MS = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// ALP-976: Latency instrumentation
// Measures elapsed time from setSTTActive(false) to the moment the first
// haptic fires. The test harness subscribes via setLatencyCallback.
// ─────────────────────────────────────────────────────────────────────────────

let sttDeactivatedAt: number | null = null;
let latencyCallback: ((latencyMs: number) => void) | null = null;

/**
 * Register a callback that receives pause-to-haptic latency in milliseconds.
 * Fired once per STT deactivation that triggers a queued haptic pattern.
 * Pass null to unsubscribe.
 */
export function setLatencyCallback(cb: ((latencyMs: number) => void) | null): void {
  latencyCallback = cb;
}

// Android adds spin-down latency; pad pauses by this amount.
const ANDROID_PAUSE_PADDING_MS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

type CancelFn = () => void;

interface QueuedCue {
  pattern: HapticTimingPattern;
  enqueuedAt: number;
}

let activeCancel: CancelFn | null = null;
let loopIntervalId: ReturnType<typeof setInterval> | null = null;
let sttActive = false;
const cueQueue: QueuedCue[] = [];

// Ownership guard: only the current owner can play/stop patterns.
let currentOwner: string | null = null;

/**
 * Acquire exclusive ownership of the haptic player.
 * Returns true if ownership was granted, false if another owner holds it.
 * The caller must call release() when done (typically on unmount).
 */
export function acquire(owner: string): boolean {
  if (currentOwner !== null && currentOwner !== owner) return false;
  currentOwner = owner;
  return true;
}

/**
 * Release ownership. Stops any active pattern and clears the queue.
 * Only the current owner can release. No-op if owner does not match.
 */
export function release(owner: string): void {
  if (currentOwner !== owner) return;
  stopProximityLoop();
  stopCurrent();
  cueQueue.length = 0;
  sttActive = false;
  sttDeactivatedAt = null;
  currentOwner = null;
}

/** Returns the current owner, or null if unowned. */
export function owner(): string | null {
  return currentOwner;
}

// iOS: map event duration to the closest ImpactFeedbackStyle bucket.
function durationToImpactStyle(
  durationMs: number,
): Haptics.ImpactFeedbackStyle {
  if (durationMs <= 120) return Haptics.ImpactFeedbackStyle.Light;
  if (durationMs <= 300) return Haptics.ImpactFeedbackStyle.Medium;
  return Haptics.ImpactFeedbackStyle.Heavy;
}

// Build an Android Vibration pattern array from timing events.
// Format: [pause, vibrate, pause, vibrate, ...]  (first element is always pause)
function toAndroidPattern(events: HapticTimingEvent[]): number[] {
  const result: number[] = [];
  let cursor = 0;

  for (const event of events) {
    const gap = event.startTime - cursor;
    const duration = event.endTime - event.startTime;

    if (event.isPause) {
      cursor = event.endTime;
      continue;
    }

    // Leading silence before this vibration
    const silence = gap + (result.length % 2 === 0 ? 0 : ANDROID_PAUSE_PADDING_MS);
    result.push(silence > 0 ? silence : 0);
    result.push(duration);
    cursor = event.endTime;
  }

  return result;
}

// Fire a single pattern immediately (no mutex check).
function firePattern(pattern: HapticTimingPattern): CancelFn {
  // ALP-976: report latency from STT deactivation to first haptic fire
  if (sttDeactivatedAt !== null) {
    const latencyMs = Date.now() - sttDeactivatedAt;
    sttDeactivatedAt = null;
    latencyCallback?.(latencyMs);
  }

  const timeouts: ReturnType<typeof setTimeout>[] = [];

  if (Platform.OS === 'android') {
    const androidPat = toAndroidPattern(pattern);
    if (androidPat.length > 0) Vibration.vibrate(androidPat);
    const totalMs = pattern.at(-1)?.endTime ?? 0;
    const t = setTimeout(() => {}, totalMs);
    timeouts.push(t);
    return () => {
      clearTimeout(t);
      Vibration.cancel();
    };
  }

  // iOS: schedule each vibration event via setTimeout
  const vibratingEvents = pattern.filter((e) => !e.isPause);
  for (const event of vibratingEvents) {
    const style = durationToImpactStyle(event.endTime - event.startTime);
    const t = setTimeout(() => {
      Haptics.impactAsync(style).catch(() => {});
    }, event.startTime);
    timeouts.push(t);
  }

  return () => timeouts.forEach(clearTimeout);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a haptic pattern.
 *
 * If STT is active, the cue is queued and will fire after STT deactivates.
 * Any currently playing pattern is cancelled before the new one starts.
 */
export function playPattern(pattern: HapticTimingPattern): void {
  if (currentOwner === null && __DEV__) {
    console.warn('hapticPatternPlayer: playPattern called without ownership. Call acquire() first.');
  }
  if (sttActive) {
    cueQueue.push({ pattern, enqueuedAt: Date.now() });
    return;
  }
  stopCurrent();
  activeCancel = firePattern(pattern);
}

/** Cancel whatever is currently playing. */
export function stopCurrent(): void {
  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }
  if (Platform.OS === 'android') {
    Vibration.cancel();
  }
}

/**
 * Start a Scheme 4 proximity ramp loop.
 *
 * Fires `pattern` immediately and then repeats every `intervalMs`.
 * Replaces any existing loop. Respects the STT mutex.
 */
export function startProximityLoop(
  pattern: HapticTimingPattern,
  intervalMs: number,
): void {
  stopProximityLoop();
  playPattern(pattern);
  loopIntervalId = setInterval(() => playPattern(pattern), intervalMs);
}

/** Stop the Scheme 4 proximity ramp loop. */
export function stopProximityLoop(): void {
  if (loopIntervalId !== null) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }
  stopCurrent();
}

/**
 * ALP-976: Notify the player that STT is active or inactive.
 *
 * On deactivation, drains the queue. Cues older than MAX_QUEUE_AGE_MS
 * are discarded to prevent a haptic burst after a long dictation session.
 */
export function setSTTActive(active: boolean): void {
  const wasActive = sttActive;
  sttActive = active;

  if (wasActive && !active) {
    sttDeactivatedAt = Date.now();
    drainQueue();
  }
}

/** Returns true if STT is currently holding haptic cues. */
export function isSTTActive(): boolean {
  return sttActive;
}

/** Returns the number of cues currently queued behind the STT mutex. */
export function queueLength(): number {
  return cueQueue.length;
}

function drainQueue(): void {
  const now = Date.now();
  while (cueQueue.length > 0) {
    const cue = cueQueue.shift()!;
    if (now - cue.enqueuedAt > MAX_QUEUE_AGE_MS) continue; // stale, discard
    playPattern(cue.pattern);
    break; // fire only the first live cue; let it complete before the next
  }
}
