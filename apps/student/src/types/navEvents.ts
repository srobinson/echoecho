/**
 * Typed event contract for the GPS navigation service (ALP-956).
 *
 * All downstream services (ALP-957 PDR, ALP-958 haptics, ALP-959 audio,
 * ALP-960 off-route) consume events via the callback registered in
 * useGpsNavigation. The contract is finalized here so all dependents can
 * compile independently.
 */
export type NavEvent =
  | { type: 'approaching_waypoint'; waypointId: string; distanceMeters: number }
  | { type: 'at_waypoint'; waypointId: string; turnDirection: 'left' | 'right' | 'straight' | 'arrived' }
  | { type: 'off_route'; deviationMeters: number; bearingToRoute: number; source: 'gps' | 'pdr' }
  | { type: 'arrived' }
  | { type: 'position_degraded'; accuracyMeters: number }
  | { type: 'position_restored' }
  | { type: 'pdr_accuracy_warning' };

export type NavEventHandler = (event: NavEvent) => void;

/** Position that can be injected from PDR (ALP-957) or GPS. */
export interface TrackPositionUpdate {
  lat: number;
  lng: number;
  heading: number;
  accuracy: number;
  /** Meters per second — used by off-route stationary suppression. */
  speed: number;
  source: 'gps' | 'pdr';
}
