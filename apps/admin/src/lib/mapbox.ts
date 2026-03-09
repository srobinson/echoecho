/**
 * Mapbox configuration constants.
 */

/**
 * Mapbox Satellite Streets style — aerial imagery with road and label overlays.
 * This is the primary base layer for EchoEcho Admin.
 */
export const MAPBOX_STYLE_SATELLITE =
  'mapbox://styles/mapbox/satellite-streets-v12';

/**
 * Standard streets style used as an alternative base.
 */
export const MAPBOX_STYLE_STREETS = 'mapbox://styles/mapbox/streets-v12';

/**
 * Off-route threshold — deviation beyond this triggers rerouting guidance.
 */
export const OFF_ROUTE_THRESHOLD_M = 15;

/**
 * Waypoint capture threshold — auto-captures waypoint when speed drops below.
 */
export const WAYPOINT_SPEED_THRESHOLD_MPS = 0.3;

/**
 * Minimum GPS accuracy required to start recording (meters).
 */
export const MIN_GPS_ACCURACY_M = 10;
