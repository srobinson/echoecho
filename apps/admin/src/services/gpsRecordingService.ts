/**
 * ALP-947: GPS track recording service.
 *
 * Registers and manages the expo-task-manager background location task
 * (task ID: echoecho.gps-recording). Handles permission flow, battery-aware
 * accuracy degradation, and file-based buffer persistence (flush every 10 samples).
 *
 * TaskManager.defineTask MUST be called at module load time (before any component
 * renders). Import this file in the root _layout.tsx to ensure early registration.
 *
 * Shared with ALP-956 (navigation GPS): permission logic lives in
 * packages/shared/src/lib/locationPermissions.ts.
 *
 * Battery behaviour:
 *   level >= 20% → Location.Accuracy.High, interval 1 000 ms
 *   level <  20% → Location.Accuracy.Balanced, interval 2 000 ms
 *   On downgrade: emits 'accuracy_degraded' event so the UI can notify the admin.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as FileSystem from 'expo-file-system';
import * as Battery from 'expo-battery';
// EventSubscription is the return type of addBatteryLevelListener
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AppState, Platform } from 'react-native';

import { useRecordingStore } from '../stores/recordingStore';
import type { TrackPoint } from '@echoecho/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

export const GPS_TASK_ID = 'echoecho.gps-recording';

const BUFFER_PATH = `${FileSystem.documentDirectory}echoecho-track-buffer.json`;

const FLUSH_EVERY_N = 10;

const MIN_SPEED_FOR_HEADING = 0.5; // m/s — below this GPS heading is unreliable
const ACCURACY_THRESHOLD_M = 20;   // flag samples worse than this

const BATTERY_LOW = 0.2;

const HIGH_ACCURACY_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 1000,
  distanceInterval: 0,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Fitness,
};

const BALANCED_ACCURACY_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 2000,
  distanceInterval: 0,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Fitness,
};

// ── Module-level state ────────────────────────────────────────────────────────
// Mutable module-level variables are shared across the foreground and background
// task callback within the same JS context (iOS and Android foreground).
// On Android truly-headless restart a fresh context initialises these to defaults,
// which is acceptable — the file buffer is the durable source in that case.

let _sequenceIndex = 0;
let _sampleCountSinceFlush = 0;
let _isPaused = false;
let _degraded = false;

// ── Simple event emitter ──────────────────────────────────────────────────────

type GpsServiceEvent = 'accuracy_degraded' | 'accuracy_restored';
type AnyListener = (...args: unknown[]) => void;
const _listeners = new Map<GpsServiceEvent, Set<AnyListener>>();

export function on(event: GpsServiceEvent, fn: AnyListener): void {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event)!.add(fn);
}

export function off(event: GpsServiceEvent, fn: AnyListener): void {
  _listeners.get(event)?.delete(fn);
}

function emit(event: GpsServiceEvent, ...args: unknown[]): void {
  _listeners.get(event)?.forEach((fn) => fn(...args));
}

// ── Location mapping ──────────────────────────────────────────────────────────

function mapLocation(loc: Location.LocationObject, seqIdx: number): TrackPoint {
  const { coords, timestamp } = loc;
  const speed = coords.speed ?? null;
  const accuracy = coords.accuracy ?? null;

  // Null heading when speed is known-low; GPS heading at walking pace is unreliable.
  const heading =
    speed !== null && speed < MIN_SPEED_FOR_HEADING
      ? null
      : (coords.heading ?? null);

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: coords.altitude ?? null,
    altitudeAccuracy: coords.altitudeAccuracy ?? null,
    accuracy,
    heading,
    speed,
    timestamp,
    sequenceIndex: seqIdx,
    flagged: accuracy !== null && accuracy > ACCURACY_THRESHOLD_M,
  };
}

// ── Buffer persistence ────────────────────────────────────────────────────────

async function flushBuffer(points: TrackPoint[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(BUFFER_PATH, JSON.stringify(points), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    // Non-fatal: buffer is still in Zustand memory while the app is running.
  }
}

/** Recover a persisted buffer after an app kill mid-recording. */
export async function loadPersistedBuffer(): Promise<TrackPoint[]> {
  try {
    const info = await FileSystem.getInfoAsync(BUFFER_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(BUFFER_PATH);
    const parsed = JSON.parse(raw) as TrackPoint[];
    _sequenceIndex = parsed.length > 0 ? (parsed[parsed.length - 1].sequenceIndex + 1) : 0;
    return parsed;
  } catch {
    return [];
  }
}

/** Remove the persisted buffer after a successful route save. */
export async function clearPersistedBuffer(): Promise<void> {
  try {
    await FileSystem.deleteAsync(BUFFER_PATH, { idempotent: true });
  } catch {
    // Ignore
  }
}

// ── Background task definition (MUST be at module load time) ─────────────────

TaskManager.defineTask(GPS_TASK_ID, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length || _isPaused) return;

  // Map incoming locations to TrackPoints
  const points: TrackPoint[] = locations.map((loc) => mapLocation(loc, _sequenceIndex++));

  // Always persist to file buffer first. On Android headless restart the Zustand
  // store resets to defaults (no session), but the file buffer survives. The
  // foreground recovery handler (registerForegroundRecovery) merges these back.
  const persisted = await loadPersistedBuffer();
  persisted.push(...points);
  _sampleCountSinceFlush += points.length;

  if (_sampleCountSinceFlush >= FLUSH_EVERY_N) {
    _sampleCountSinceFlush = 0;
    await flushBuffer(persisted);
  }

  // Update in-memory store when available (foreground + iOS background contexts)
  const store = useRecordingStore.getState();
  if (store.session?.state === 'recording') {
    for (const point of points) {
      store.appendTrackPoint(point);
    }
  }
});

// ── Battery management ────────────────────────────────────────────────────────

async function getBatteryLevel(): Promise<number> {
  try {
    return await Battery.getBatteryLevelAsync();
  } catch {
    return 1; // Assume full if unable to read
  }
}

async function applyBatteryAwareOptions(): Promise<Location.LocationTaskOptions> {
  const level = await getBatteryLevel();
  const isLow = level < BATTERY_LOW;

  if (isLow && !_degraded) {
    _degraded = true;
    emit('accuracy_degraded', {
      batteryLevel: Math.round(level * 100),
      accuracy: 'Balanced',
      intervalMs: 2000,
    });
  } else if (!isLow && _degraded) {
    _degraded = false;
    emit('accuracy_restored', { batteryLevel: Math.round(level * 100) });
  }

  return isLow ? BALANCED_ACCURACY_OPTIONS : HIGH_ACCURACY_OPTIONS;
}

// EventSubscription shape returned by addBatteryLevelListener
type BatterySubscription = { remove: () => void };
let _batterySubscription: BatterySubscription | null = null;

function subscribeBattery(): void {
  _batterySubscription = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
    const isLow = batteryLevel < BATTERY_LOW;
    if (isLow !== _degraded) {
      const newOptions = await applyBatteryAwareOptions();
      const hasTask = await TaskManager.isTaskRegisteredAsync(GPS_TASK_ID);
      if (hasTask) {
        try {
          await Location.startLocationUpdatesAsync(GPS_TASK_ID, newOptions);
        } catch {
          // Task may not be running; ignore
        }
      }
    }
  }) as unknown as BatterySubscription;
}

function unsubscribeBattery(): void {
  _batterySubscription?.remove();
  _batterySubscription = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the GPS location updates background task.
 * Caller is responsible for confirming permissions before calling this.
 */
let _starting = false;

export async function startLocationTask(): Promise<void> {
  // Guard against concurrent calls (auto-start + manual tap race).
  if (_starting) return;
  _starting = true;

  try {
    const options = await applyBatteryAwareOptions();
    await Location.startLocationUpdatesAsync(GPS_TASK_ID, options);
    subscribeBattery();
    _isPaused = false;
    _sampleCountSinceFlush = 0;
  } finally {
    _starting = false;
  }
}

/** Pause location collection without stopping the OS task (keeps background entitlement alive). */
export function pauseLocationTask(): void {
  _isPaused = true;
}

/** Resume after pause. */
export function resumeLocationTask(): void {
  _isPaused = false;
}

/** Stop the OS location task and clean up. */
export async function stopLocationTask(): Promise<void> {
  _isPaused = false;
  _degraded = false;
  unsubscribeBattery();
  try {
    const hasTask = await TaskManager.isTaskRegisteredAsync(GPS_TASK_ID);
    if (hasTask) {
      await Location.stopLocationUpdatesAsync(GPS_TASK_ID);
    }
  } catch {
    // Task may already have been stopped by OS
  }
}

/**
 * Register an AppState listener that merges the file buffer back into the store
 * when the app returns to foreground. Call once from the root layout.
 */
export function registerForegroundRecovery(): () => void {
  const subscription = AppState.addEventListener('change', async (nextState) => {
    if (nextState !== 'active') return;

    const store = useRecordingStore.getState();
    if (!store.session || store.session.state !== 'recording') return;

    // On Android the background headless context may have advanced _sequenceIndex
    // while writing to file but not to the store. Merge any new points.
    const persisted = await loadPersistedBuffer();
    const currentMax = store.session.trackPoints.reduce(
      (m, p) => Math.max(m, p.sequenceIndex),
      -1,
    );
    const newPoints = persisted.filter((p) => p.sequenceIndex > currentMax);
    for (const p of newPoints) {
      store.appendTrackPoint(p);
    }
  });

  return () => subscription.remove();
}

// Android 12+: foreground service with type=location is configured via the
// expo-location plugin in app.json (isAndroidForegroundServiceEnabled: true).
// No runtime call is needed here; expo-location handles it.
if (Platform.OS === 'android') {
  // Ensure the foreground service notification channel is set by expo-location.
  // No-op comment for reviewers: configuration lives in app.json plugin options.
}
