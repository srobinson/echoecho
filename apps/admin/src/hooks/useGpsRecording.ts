/**
 * ALP-947: React hook wiring the GPS recording service to the recording store.
 *
 * Handles:
 *   - Permission request flow (iOS two-step, Android two-step)
 *   - Starting/pausing/resuming/stopping the location task
 *   - accuracy_degraded events → surfaced as hook state for UI notification
 *   - Foreground recovery on AppState 'active' (registers once on mount)
 *   - Automatic waypoint detection via waypointDetectionService (ALP-948)
 *
 * Usage:
 *   const { permissionStatus, isDegraded, startRecording, ... } = useGpsRecording();
 */
import { useState, useEffect, useCallback, useRef } from 'react';

import {
  requestLocationPermissions,
  openLocationSettings,
} from '../lib/locationPermissions';

import {
  startLocationTask,
  stopLocationTask,
  pauseLocationTask,
  resumeLocationTask,
  registerForegroundRecovery,
  loadPersistedBuffer,
  on as gpsOn,
  off as gpsOff,
} from '../services/gpsRecordingService';
import {
  processTrackPoint,
  createWaypointDetectionState,
  DEFAULT_CONFIG,
} from '../services/waypointDetectionService';
import { useRecordingStore } from '../stores/recordingStore';

function logGpsHookDebug(step: string, details?: unknown) {
  if (!__DEV__) return;
  if (details === undefined) {
    console.log(`[GpsRecordingDebug] ${step}`);
    return;
  }
  console.log(`[GpsRecordingDebug] ${step}`, details);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionStatus =
  | 'unknown'
  | 'granted'
  | 'foreground_only'
  | 'denied'
  | 'restricted';

export interface UseGpsRecordingReturn {
  permissionStatus: PermissionStatus;
  isDegraded: boolean;
  hasPersistedBuffer: boolean;
  requestPermissions: () => Promise<PermissionStatus>;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  recoverPersistedSession: () => Promise<void>;
  openSettings: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGpsRecording(): UseGpsRecordingReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [isDegraded, setIsDegraded] = useState(false);
  const [hasPersistedBuffer, setHasPersistedBuffer] = useState(false);

  const store = useRecordingStore();
  const detectionStateRef = useRef(createWaypointDetectionState());

  // Check for a persisted buffer from a previously killed session
  useEffect(() => {
    loadPersistedBuffer().then((points) => {
      setHasPersistedBuffer(points.length > 0);
    });
  }, []);

  // Register foreground recovery listener once on mount
  useEffect(() => {
    const unregister = registerForegroundRecovery();
    return unregister;
  }, []);

  // Subscribe to GPS service events
  useEffect(() => {
    const onDegraded = () => setIsDegraded(true);
    const onRestored = () => setIsDegraded(false);

    gpsOn('accuracy_degraded', onDegraded);
    gpsOn('accuracy_restored', onRestored);

    return () => {
      gpsOff('accuracy_degraded', onDegraded);
      gpsOff('accuracy_restored', onRestored);
    };
  }, []);

  // Run waypoint detection on each new track point and auto-insert candidates
  const trackPoints = store.session?.trackPoints;
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (!trackPoints) {
      prevLengthRef.current = 0;
      detectionStateRef.current = createWaypointDetectionState();
      return;
    }

    // Process only newly appended points
    const newPoints = trackPoints.slice(prevLengthRef.current);
    prevLengthRef.current = trackPoints.length;

    for (const point of newPoints) {
      const result = processTrackPoint(point, detectionStateRef.current, DEFAULT_CONFIG);
      detectionStateRef.current = result.state;

      if (result.waypoint) {
        store.addPendingWaypoint({
          localId: `auto-${result.waypoint.trackPointIndex}-${Date.now()}`,
          coordinate: result.waypoint.coordinate,
          type: result.waypoint.reason === 'turn' ? 'turn' : 'regular',
          audioLabel: null,
          description: `Auto-detected ${result.waypoint.reason}`,
          photoUri: null,
          audioAnnotationUri: null,
          capturedAt: result.waypoint.timestamp,
        });
      }
    }
  }, [trackPoints, store]);

  // ── Permission ──────────────────────────────────────────────────────────────

  const requestPermissions = useCallback(async (): Promise<PermissionStatus> => {
    logGpsHookDebug('requestPermissions:start');
    const result = await requestLocationPermissions();
    logGpsHookDebug('requestPermissions:result', result);

    if (!result.foreground.granted) {
      const status: PermissionStatus = result.foreground.canAskAgain ? 'denied' : 'restricted';
      setPermissionStatus(status);
      return status;
    }

    if (!result.background.granted) {
      setPermissionStatus('foreground_only');
      return 'foreground_only';
    }

    setPermissionStatus('granted');
    return 'granted';
  }, []);

  // ── Recording control ───────────────────────────────────────────────────────

  const startRecording = useCallback(async (): Promise<void> => {
    logGpsHookDebug('startRecording:start');
    // Reset waypoint detection state for the new session
    detectionStateRef.current = createWaypointDetectionState();
    prevLengthRef.current = 0;

    logGpsHookDebug('startRecording:store.startRecording:before');
    store.startRecording();
    logGpsHookDebug('startRecording:store.startRecording:after', {
      sessionState: useRecordingStore.getState().session?.state ?? null,
    });
    logGpsHookDebug('startRecording:startLocationTask:before');
    await startLocationTask();
    logGpsHookDebug('startRecording:startLocationTask:after');
  }, [store]);

  const pauseRecording = useCallback((): void => {
    store.pauseRecording();
    pauseLocationTask();
  }, [store]);

  const resumeRecording = useCallback((): void => {
    store.resumeRecording();
    resumeLocationTask();
  }, [store]);

  const stopRecording = useCallback(async (): Promise<void> => {
    store.stopRecording();
    await stopLocationTask();
  }, [store]);

  // ── Crash recovery ──────────────────────────────────────────────────────────

  const recoverPersistedSession = useCallback(async (): Promise<void> => {
    const points = await loadPersistedBuffer();
    if (points.length === 0) return;

    store.startRecording();
    for (const p of points) {
      store.appendTrackPoint(p);
    }
    setHasPersistedBuffer(false);
  }, [store]);

  return {
    permissionStatus,
    isDegraded,
    hasPersistedBuffer,
    requestPermissions,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    recoverPersistedSession,
    openSettings: openLocationSettings,
  };
}
