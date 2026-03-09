/**
 * Off-route detection and corrective re-guidance (ALP-960).
 *
 * Receives off_route NavEvents from ALP-956 (GPS service), applies stationary
 * suppression and hysteresis, then signals ALP-958 (haptic) and ALP-959
 * (audio) to guide the user back.
 *
 * Thresholds:
 *   GPS mode: deviation > 15m for > 5s (enforced in ALP-956)
 *   PDR mode: ALP-956 uses 15m threshold but PDR error is 2–10m, so
 *             ALP-960 reads isPDRActive and raises its alert threshold to
 *             suppress marginal events.
 *
 * Re-route suggestion fires at > 50m only when network is available.
 * Re-route recalculation is out of scope — this issue detects and announces.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { NavEvent } from '../types/navEvents';
import type { TrackPositionUpdate } from '../types/navEvents';

// ── Configurable thresholds ───────────────────────────────────────────────────

const PDR_DEVIATION_FILTER_M = 25;   // suppress off_route in PDR mode below this
const REROUTE_SUGGESTION_M = 50;
const CORRECTIVE_INTERVAL_MS = 5_000;
const HYSTERESIS_MS = 10_000;
const STATIONARY_SPEED_MS = 0.3;    // m/s below which user is stationary
const STATIONARY_DURATION_MS = 30_000;

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseOffRouteDetectionResult {
  onNavEvent: (event: NavEvent) => void;
  /** Provide current position for stationary detection and re-route checks. */
  setPositionRef: (ref: React.MutableRefObject<TrackPositionUpdate | null>) => void;
  /** Whether PDR is currently active (from ALP-957). */
  setIsPDRActive: (active: boolean) => void;
}

export function useOffRouteDetection(
  hapticOnNavEvent: (event: NavEvent) => void,
  audioOnNavEvent: (event: NavEvent) => Promise<void>
): UseOffRouteDetectionResult {
  const positionRef = useRef<React.MutableRefObject<TrackPositionUpdate | null> | null>(null);
  const isPDRActiveRef = useRef(false);
  const offRouteRef = useRef(false);
  const correctiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hysteresisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inHysteresisRef = useRef(false);
  const stationaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressCorrectiveRef = useRef(false);

  // Clear all timers on unmount to prevent stale closures and phantom announcements
  useEffect(() => {
    return () => {
      if (correctiveTimerRef.current) clearInterval(correctiveTimerRef.current);
      if (hysteresisTimerRef.current) clearTimeout(hysteresisTimerRef.current);
      if (stationaryTimerRef.current) clearTimeout(stationaryTimerRef.current);
    };
  }, []);

  const stopCorrectiveGuidance = useCallback(() => {
    if (correctiveTimerRef.current) {
      clearInterval(correctiveTimerRef.current);
      correctiveTimerRef.current = null;
    }
    offRouteRef.current = false;
    suppressCorrectiveRef.current = false;
  }, []);

  const startHysteresis = useCallback(() => {
    inHysteresisRef.current = true;
    if (hysteresisTimerRef.current) clearTimeout(hysteresisTimerRef.current);
    hysteresisTimerRef.current = setTimeout(() => {
      inHysteresisRef.current = false;
    }, HYSTERESIS_MS);
  }, []);

  const emitCorrective = useCallback((bearing: number) => {
    if (suppressCorrectiveRef.current) return;
    const pos = positionRef.current?.current;
    if (pos && pos.speed < STATIONARY_SPEED_MS) return; // stationary suppression

    const cardinal = bearingToCardinal(bearing);
    void audioOnNavEvent({
      type: 'off_route',
      deviationMeters: 0,       // caller uses their last known value
      bearingToRoute: bearing,
      source: isPDRActiveRef.current ? 'pdr' : 'gps',
    });
    AccessibilityInfo.announceForAccessibility(
      `Head ${cardinal} to return to the route.`
    );
  }, [audioOnNavEvent]);

  const startCorrectiveGuidance = useCallback((bearing: number) => {
    if (correctiveTimerRef.current) return; // already running
    offRouteRef.current = true;

    // Immediate first corrective
    emitCorrective(bearing);

    correctiveTimerRef.current = setInterval(() => {
      emitCorrective(bearing);
    }, CORRECTIVE_INTERVAL_MS);
  }, [emitCorrective]);

  // Track stationary state
  const updateStationaryState = useCallback(() => {
    const pos = positionRef.current?.current;
    if (!pos) return;
    if (pos.speed < STATIONARY_SPEED_MS) {
      if (!stationaryTimerRef.current) {
        stationaryTimerRef.current = setTimeout(() => {
          suppressCorrectiveRef.current = true;
        }, STATIONARY_DURATION_MS);
      }
    } else {
      if (stationaryTimerRef.current) {
        clearTimeout(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }
      suppressCorrectiveRef.current = false;
    }
  }, []);

  const onNavEvent = useCallback((event: NavEvent) => {
    switch (event.type) {
      case 'off_route': {
        const { deviationMeters, bearingToRoute, source } = event;

        // PDR filter: PDR events with deviation < 25m are likely position drift
        if (isPDRActiveRef.current && deviationMeters < PDR_DEVIATION_FILTER_M) return;

        // Hysteresis suppression
        if (inHysteresisRef.current) return;

        // Already off-route — corrective interval handles ongoing guidance
        if (offRouteRef.current) return;

        // Fire off_route haptic (preempts queue)
        hapticOnNavEvent(event);
        void audioOnNavEvent(event);
        AccessibilityInfo.announceForAccessibility('You are off route.');

        // Log source for post-session analysis
        console.log('[OffRoute]', { deviationMeters, source });

        // Re-route suggestion at > 50m
        if (deviationMeters > REROUTE_SUGGESTION_M) {
          void checkNetworkAndSuggestReroute();
        }

        updateStationaryState();
        startCorrectiveGuidance(bearingToRoute);
        break;
      }

      case 'at_waypoint':
      case 'arrived': {
        // User returned to route — apply hysteresis and stop corrective guidance
        if (offRouteRef.current) {
          stopCorrectiveGuidance();
          startHysteresis();
        }
        break;
      }

      default:
        // Pass all other events through to update stationary state
        updateStationaryState();
        break;
    }
  }, [
    hapticOnNavEvent, audioOnNavEvent,
    startCorrectiveGuidance, stopCorrectiveGuidance,
    startHysteresis, updateStationaryState,
  ]);

  const setPositionRef = useCallback(
    (ref: React.MutableRefObject<TrackPositionUpdate | null>) => {
      positionRef.current = ref;
    }, []
  );

  const setIsPDRActive = useCallback((active: boolean) => {
    isPDRActiveRef.current = active;
  }, []);

  return { onNavEvent, setPositionRef, setIsPDRActive };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bearingToCardinal(bearing: number): string {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return dirs[Math.round(bearing / 45) % 8];
}

async function checkNetworkAndSuggestReroute(): Promise<void> {
  try {
    const response = await fetch('https://connectivity-check.expo.io/', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    if (response.ok) {
      // Network available — re-route request would go here (out of scope for ALP-960)
      AccessibilityInfo.announceForAccessibility(
        'You are more than 50 meters off route. Re-routing.'
      );
    } else {
      throw new Error('no connectivity');
    }
  } catch {
    AccessibilityInfo.announceForAccessibility(
      'Unable to re-route without internet connection. Your original route is still active.'
    );
  }
}
