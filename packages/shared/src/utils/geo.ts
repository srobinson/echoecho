import type { Coordinate, CoordinateWithAltitude } from '../types/geo';

const EARTH_RADIUS_M = 6_371_000;

/**
 * Haversine distance between two coordinates (meters).
 */
export function computeDistance(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      sinHalfLon *
      sinHalfLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Initial bearing from a to b (degrees, 0=North, clockwise).
 */
export function computeBearing(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Ramer-Douglas-Peucker simplification for track compression.
 * @param points  Raw track points
 * @param epsilon Tolerance in meters
 */
export function simplifyTrack(
  points: CoordinateWithAltitude[],
  epsilon: number = 5,
): CoordinateWithAltitude[] {
  if (points.length < 3) return points;
  return rdp(points, epsilon);
}

function perpendicularDistance(
  point: Coordinate,
  lineStart: Coordinate,
  lineEnd: Coordinate,
): number {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;
  if (dx === 0 && dy === 0) return computeDistance(point, lineStart);
  const t =
    ((point.longitude - lineStart.longitude) * dx +
      (point.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy);
  const nearest: Coordinate = {
    longitude: lineStart.longitude + t * dx,
    latitude: lineStart.latitude + t * dy,
  };
  return computeDistance(point, nearest);
}

/**
 * Haversine distance using scalar lat/lng pairs (meters).
 * Thin wrapper over computeDistance for call sites that work with
 * individual coordinates rather than Coordinate objects.
 */
export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return computeDistance(
    { latitude: lat1, longitude: lng1 },
    { latitude: lat2, longitude: lng2 },
  );
}

/**
 * Initial bearing using scalar lat/lng pairs (degrees, 0=North, clockwise).
 */
export function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return computeBearing(
    { latitude: lat1, longitude: lng1 },
    { latitude: lat2, longitude: lng2 },
  );
}

/**
 * Normalizes a bearing difference to [-180, 180].
 */
export function normalizeAngle(degrees: number): number {
  let d = degrees % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function rdp<T extends Coordinate>(points: T[], epsilon: number): T[] {
  let maxDist = 0;
  let maxIdx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}
