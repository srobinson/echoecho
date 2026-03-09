/**
 * IMU/PDR fallback positioning (ALP-957).
 *
 * Activates on `position_degraded`, deactivates on `position_restored`.
 * Feeds estimated positions into ALP-956's injectPosition() interface.
 *
 * Known limitations:
 *   - Fixed step length (0.75m). Error varies with gait.
 *   - Magnetometer heading degrades near steel structures / building interiors.
 *   - Safe range: routes < 80m without GPS correction.
 *   - Beyond 80m accumulated travel, emit pdr_accuracy_warning.
 *   - Upgrade path if insufficient: ARCore/ARKit SLAM.
 *
 * iOS/Android accelerometer axis inversion: expo-sensors issue #19229.
 * X and Y axes are inverted on Android; normalize before any calculation.
 */
import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
} from 'expo-sensors';
import { haversineM } from '@echoecho/shared';
import type { NavEventHandler, TrackPositionUpdate } from '../types/navEvents';

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_LENGTH_M = 0.75;
const SAMPLE_INTERVAL_MS = 25;          // 40Hz
const STEP_THRESHOLD = 1.2;             // m/s² above which a peak is counted
const STEP_HYSTERESIS = 0.8;            // must drop below this before next step
const COMPLEMENTARY_ALPHA = 0.98;       // gyro weight in heading filter
const PDR_WARNING_DISTANCE_M = 80;
const SNAP_THRESHOLD_M = 15;            // snap to route after each step

// ── Axis normalization ───────────────────────────────────────────────────────

function normalizeAccel(x: number, y: number): { x: number; y: number } {
  return Platform.OS === 'android' ? { x: -x, y: -y } : { x, y };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePdrNavigationResult {
  isPDRActive: boolean;
  activate: (startLat: number, startLng: number, startHeading: number) => void;
  deactivate: () => void;
  onNavEvent: (handler: NavEventHandler) => void;
  /**
   * Called when GPS restores (position_restored). Re-anchors PDR estimated
   * position to GPS truth. Delta < 10m: smooth interpolation over 2s.
   * Delta >= 10m: immediate snap.
   */
  reanchor: (gpsLat: number, gpsLng: number) => void;
}

export function usePdrNavigation(
  injectPosition: (update: TrackPositionUpdate) => void
): UsePdrNavigationResult {
  const activeRef = useRef(false);
  const eventHandlerRef = useRef<NavEventHandler | null>(null);

  // PDR state
  const posRef = useRef({ lat: 0, lng: 0 });
  const headingRef = useRef(0);
  const traveledMRef = useRef(0);
  const lastAccelMagRef = useRef(0);
  const aboveThresholdRef = useRef(false);
  const lastGyroTimeRef = useRef<number | null>(null);

  const accelSubRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const gyroSubRef = useRef<ReturnType<typeof Gyroscope.addListener> | null>(null);
  const magSubRef = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);

  const magHeadingRef = useRef(0);
  const reanchorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepForward = useCallback(() => {
    const headingRad = (headingRef.current * Math.PI) / 180;
    const dLat = (STEP_LENGTH_M * Math.cos(headingRad)) / 111_320;
    const dLng = (STEP_LENGTH_M * Math.sin(headingRad)) /
      (111_320 * Math.cos((posRef.current.lat * Math.PI) / 180));

    posRef.current = {
      lat: posRef.current.lat + dLat,
      lng: posRef.current.lng + dLng,
    };
    traveledMRef.current += STEP_LENGTH_M;

    if (traveledMRef.current >= PDR_WARNING_DISTANCE_M) {
      eventHandlerRef.current?.({ type: 'pdr_accuracy_warning' });
    }

    injectPosition({
      lat: posRef.current.lat,
      lng: posRef.current.lng,
      heading: headingRef.current,
      accuracy: 5,  // estimated PDR accuracy
      speed: STEP_LENGTH_M / (SAMPLE_INTERVAL_MS / 1000),
      source: 'pdr',
    });
  }, [injectPosition]);

  // Shared teardown: remove subscriptions first, then clear the active flag.
  // Ordering matters: sensor callbacks check activeRef before processing, so
  // removing subscriptions while activeRef is still true prevents the window
  // where a callback fires between flag clear and subscription removal.
  const teardownSensors = useCallback(() => {
    accelSubRef.current?.remove();
    gyroSubRef.current?.remove();
    magSubRef.current?.remove();
    accelSubRef.current = null;
    gyroSubRef.current = null;
    magSubRef.current = null;
    if (reanchorTimerRef.current) {
      clearInterval(reanchorTimerRef.current);
      reanchorTimerRef.current = null;
    }
    activeRef.current = false;
  }, []);

  const activate = useCallback((startLat: number, startLng: number, startHeading: number) => {
    // Defensively tear down any prior session to prevent duplicate listeners
    if (activeRef.current) {
      teardownSensors();
    }

    posRef.current = { lat: startLat, lng: startLng };
    headingRef.current = startHeading;
    traveledMRef.current = 0;
    lastGyroTimeRef.current = null;

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);
    Magnetometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      if (!activeRef.current) return;
      const { x: nx, y: ny } = normalizeAccel(x, y);
      const mag = Math.sqrt(nx ** 2 + ny ** 2 + z ** 2);

      // Peak-and-hysteresis step detection on vertical acceleration magnitude
      if (mag > STEP_THRESHOLD && !aboveThresholdRef.current) {
        aboveThresholdRef.current = true;
        stepForward();
      } else if (mag < STEP_HYSTERESIS) {
        aboveThresholdRef.current = false;
      }
      lastAccelMagRef.current = mag;
    });

    gyroSubRef.current = Gyroscope.addListener(({ z }) => {
      if (!activeRef.current) return;
      const now = Date.now();
      if (lastGyroTimeRef.current !== null) {
        const dt = (now - lastGyroTimeRef.current) / 1000;
        // Complementary filter: mostly gyro, corrected by magnetometer
        const gyroHeading = headingRef.current + z * dt * (180 / Math.PI);
        headingRef.current = COMPLEMENTARY_ALPHA * gyroHeading +
          (1 - COMPLEMENTARY_ALPHA) * magHeadingRef.current;
        headingRef.current = (headingRef.current + 360) % 360;
      }
      lastGyroTimeRef.current = now;
    });

    magSubRef.current = Magnetometer.addListener(({ x, y }) => {
      if (!activeRef.current) return;
      // Simple atan2 heading from magnetometer X/Y
      magHeadingRef.current = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
    });

    // Set active after subscriptions are assigned so teardownSensors() in a
    // concurrent call always finds the subscription refs populated
    activeRef.current = true;
  }, [stepForward, teardownSensors]);

  const deactivate = useCallback(() => {
    teardownSensors();
  }, [teardownSensors]);

  const onNavEvent = useCallback((handler: NavEventHandler) => {
    eventHandlerRef.current = handler;
  }, []);

  const reanchor = useCallback((gpsLat: number, gpsLng: number) => {
    const dLat = gpsLat - posRef.current.lat;
    const dLng = gpsLng - posRef.current.lng;
    const deltaM = haversineM(posRef.current.lat, posRef.current.lng, gpsLat, gpsLng);

    if (deltaM >= 10) {
      // Immediate snap for large discrepancy; log for post-session drift analysis
      posRef.current = { lat: gpsLat, lng: gpsLng };
      console.log('[PDR] reanchor snap', { deltaM });
    } else if (deltaM > 0) {
      // Smooth interpolation over 2s (10 steps x 200ms)
      if (reanchorTimerRef.current) clearInterval(reanchorTimerRef.current);
      const steps = 10;
      const stepLat = dLat / steps;
      const stepLng = dLng / steps;
      let step = 0;
      reanchorTimerRef.current = setInterval(() => {
        posRef.current = {
          lat: posRef.current.lat + stepLat,
          lng: posRef.current.lng + stepLng,
        };
        step += 1;
        if (step >= steps) {
          clearInterval(reanchorTimerRef.current!);
          reanchorTimerRef.current = null;
        }
      }, 200);
    }
  }, []);

  return {
    get isPDRActive() { return activeRef.current; },
    activate,
    deactivate,
    onNavEvent,
    reanchor,
  };
}

// Suppress unused warning on snap threshold — used by caller when snapping PDR
// positions to route in useGpsNavigation.
export { SNAP_THRESHOLD_M };