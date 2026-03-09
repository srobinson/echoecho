/**
 * GPS position tracking service for navigation (ALP-956).
 *
 * Subscribes to expo-location at high accuracy, projects positions onto the
 * route, and emits typed NavEvents to downstream consumers (ALP-957 PDR,
 * ALP-958 haptics, ALP-959 audio, ALP-960 off-route).
 *
 * Turn direction at waypoints is derived from segment bearing delta — no
 * waypoint metadata required. The injectPosition() method accepts PDR
 * positions from ALP-957 so the rest of the stack is source-agnostic.
 *
 * off_route events are emitted when deviation > 15m for > 5 consecutive
 * seconds. A watchdog fires position_degraded when no GPS update arrives
 * for 3s, complementing the accuracy-based trigger.
 */
import { useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { haversineM, bearingDeg, normalizeAngle } from '@echoecho/shared';
import type { NavEvent, NavEventHandler, TrackPositionUpdate } from '../types/navEvents';
import type { LocalWaypoint } from '../lib/localDb';

// ── Configurable thresholds (defaults per spec) ─────────────────────────────

const APPROACHING_DISTANCE_M = 15;
const AT_WAYPOINT_DISTANCE_M = 5;
const SNAP_THRESHOLD_M = 15;
const MAX_VALID_ACCURACY_M = 20;
const DEGRADED_ACCURACY_M = 10;
const DEGRADED_GAP_MS = 3_000;
const OFF_ROUTE_THRESHOLD_M = 15;
const OFF_ROUTE_DEBOUNCE_MS = 5_000;

/** Project point P onto segment AB; return projected point. */
function projectOntoSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): { lat: number; lng: number } {
  const abLat = bLat - aLat;
  const abLng = bLng - aLng;
  const apLat = pLat - aLat;
  const apLng = pLng - aLng;
  const ab2 = abLat ** 2 + abLng ** 2;
  if (ab2 === 0) return { lat: aLat, lng: aLng };
  const t = Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / ab2));
  return { lat: aLat + t * abLat, lng: aLng + t * abLng };
}

/** Distance from point to the nearest segment on the route polyline. */
function distanceToRoute(
  pLat: number, pLng: number,
  waypoints: LocalWaypoint[]
): { dist: number; bearing: number } {
  if (waypoints.length === 0) return { dist: 0, bearing: 0 };
  let minDist = Infinity;
  let nearestLat = waypoints[0].lat;
  let nearestLng = waypoints[0].lng;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const proj = projectOntoSegment(pLat, pLng, a.lat, a.lng, b.lat, b.lng);
    const d = haversineM(pLat, pLng, proj.lat, proj.lng);
    if (d < minDist) {
      minDist = d;
      nearestLat = proj.lat;
      nearestLng = proj.lng;
    }
  }
  return {
    dist: minDist,
    bearing: bearingDeg(pLat, pLng, nearestLat, nearestLng),
  };
}

/** Turn direction from bearing delta (per ALP-956 spec). */
function turnDirection(
  currentBearing: number,
  nextBearing: number
): 'left' | 'right' | 'straight' | 'arrived' {
  const delta = normalizeAngle(nextBearing - currentBearing);
  if (Math.abs(delta) < 30) return 'straight';
  return delta > 0 ? 'right' : 'left';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseGpsNavigationResult {
  startTracking: (waypoints: LocalWaypoint[], onEvent: NavEventHandler) => Promise<void>;
  stopTracking: () => void;
  injectPosition: (update: TrackPositionUpdate) => void;
  /** Exposed for ALP-959: distance to next waypoint at playback time. */
  lastPositionRef: React.MutableRefObject<TrackPositionUpdate | null>;
}

export function useGpsNavigation(): UseGpsNavigationResult {
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const waypointsRef = useRef<LocalWaypoint[]>([]);
  const handlerRef = useRef<NavEventHandler | null>(null);
  const wpIndexRef = useRef(0);
  const lastPositionRef = useRef<TrackPositionUpdate | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const approachingFiredRef = useRef(false);
  const degradedRef = useRef(false);
  const degradedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offRouteFiredRef = useRef(false);

  const emit = useCallback((event: NavEvent) => {
    handlerRef.current?.(event);
  }, []);

  const processPosition = useCallback((update: TrackPositionUpdate) => {
    const wps = waypointsRef.current;
    const idx = wpIndexRef.current;
    if (idx >= wps.length) return;

    lastUpdateTimeRef.current = Date.now();
    lastPositionRef.current = update;

    // Accuracy gate — holds invalid GPS fixes; PDR injections bypass
    if (update.source === 'gps' && update.accuracy > MAX_VALID_ACCURACY_M) return;

    // Off-route detection against full route polyline
    const { dist: routeDist, bearing: bearingToRoute } = distanceToRoute(
      update.lat, update.lng, wps
    );

    if (routeDist > OFF_ROUTE_THRESHOLD_M) {
      if (!offRouteTimerRef.current && !offRouteFiredRef.current) {
        offRouteTimerRef.current = setTimeout(() => {
          offRouteFiredRef.current = true;
          emit({
            type: 'off_route',
            deviationMeters: routeDist,
            bearingToRoute,
            source: update.source,
          });
          offRouteTimerRef.current = null;
        }, OFF_ROUTE_DEBOUNCE_MS);
      }
    } else {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
      }
      offRouteFiredRef.current = false;
    }

    // Route segment snapping for waypoint distance calculation
    const target = wps[idx];
    let distToTarget = haversineM(update.lat, update.lng, target.lat, target.lng);

    if (idx > 0) {
      const prev = wps[idx - 1];
      const projected = projectOntoSegment(
        update.lat, update.lng, prev.lat, prev.lng, target.lat, target.lng
      );
      const snapDist = haversineM(update.lat, update.lng, projected.lat, projected.lng);
      if (snapDist < SNAP_THRESHOLD_M) {
        distToTarget = haversineM(projected.lat, projected.lng, target.lat, target.lng);
      }
    }

    // Waypoint arrival
    if (distToTarget < AT_WAYPOINT_DISTANCE_M) {
      approachingFiredRef.current = false;
      const isLast = idx === wps.length - 1;

      let dir: 'left' | 'right' | 'straight' | 'arrived' = 'arrived';
      if (!isLast && idx > 0) {
        const prev = wps[idx - 1];
        const curBearing = bearingDeg(prev.lat, prev.lng, target.lat, target.lng);
        const next = wps[idx + 1];
        const nextBearing = bearingDeg(target.lat, target.lng, next.lat, next.lng);
        dir = turnDirection(curBearing, nextBearing);
      }

      emit({ type: 'at_waypoint', waypointId: target.id, turnDirection: dir });
      wpIndexRef.current += 1;

      if (isLast) emit({ type: 'arrived' });
      return;
    }

    // Approaching pre-announcement
    if (distToTarget < APPROACHING_DISTANCE_M && !approachingFiredRef.current) {
      approachingFiredRef.current = true;
      emit({ type: 'approaching_waypoint', waypointId: target.id, distanceMeters: distToTarget });
    }
  }, [emit]);

  const handleDegradedTimer = useCallback(() => {
    if (!degradedRef.current) {
      degradedRef.current = true;
      const acc = lastPositionRef.current?.accuracy ?? 99;
      emit({ type: 'position_degraded', accuracyMeters: acc });
    }
  }, [emit]);

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** Watchdog: fires position_degraded if no GPS update arrives for 3s. */
  const startWatchdog = useCallback(() => {
    stopWatchdog();
    lastUpdateTimeRef.current = Date.now();
    watchdogRef.current = setInterval(() => {
      const elapsed = Date.now() - lastUpdateTimeRef.current;
      if (elapsed > DEGRADED_GAP_MS && !degradedRef.current) {
        degradedRef.current = true;
        emit({ type: 'position_degraded', accuracyMeters: 99 });
      }
    }, 1_000);
  }, [emit, stopWatchdog]);

  const startTracking = useCallback(async (
    waypoints: LocalWaypoint[],
    onEvent: NavEventHandler
  ) => {
    waypointsRef.current = waypoints;
    handlerRef.current = onEvent;
    wpIndexRef.current = 0;
    approachingFiredRef.current = false;
    degradedRef.current = false;
    offRouteFiredRef.current = false;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    await Location.requestBackgroundPermissionsAsync();

    startWatchdog();

    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        lastUpdateTimeRef.current = Date.now();
        const acc = loc.coords.accuracy ?? 999;

        if (acc > DEGRADED_ACCURACY_M) {
          if (!degradedTimerRef.current) {
            degradedTimerRef.current = setTimeout(handleDegradedTimer, DEGRADED_GAP_MS);
          }
        } else {
          if (degradedTimerRef.current) {
            clearTimeout(degradedTimerRef.current);
            degradedTimerRef.current = null;
          }
          if (degradedRef.current) {
            degradedRef.current = false;
            emit({ type: 'position_restored' });
          }
        }

        processPosition({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          heading: loc.coords.heading ?? 0,
          accuracy: acc,
          speed: loc.coords.speed ?? 0,
          source: 'gps',
        });
      }
    );
  }, [processPosition, handleDegradedTimer, startWatchdog, emit]);

  const stopTracking = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    stopWatchdog();
    if (degradedTimerRef.current) {
      clearTimeout(degradedTimerRef.current);
      degradedTimerRef.current = null;
    }
    if (offRouteTimerRef.current) {
      clearTimeout(offRouteTimerRef.current);
      offRouteTimerRef.current = null;
    }
  }, [stopWatchdog]);

  /** PDR positions (ALP-957) injected here; processed identically to GPS. */
  const injectPosition = useCallback((update: TrackPositionUpdate) => {
    processPosition(update);
  }, [processPosition]);

  return { startTracking, stopTracking, injectPosition, lastPositionRef };
}
