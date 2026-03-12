import { haversineM, type Campus } from '@echoecho/shared';

type CampusLike = Campus & { securityPhone?: string | null };

interface DeviceCoords {
  latitude: number;
  longitude: number;
}

export interface CampusSelection<T extends CampusLike> {
  selectedCampus: T | null;
  nearestCampus: T;
  nearestDistanceMeters: number;
}

export function isPointWithinCampusBounds(campus: CampusLike, coords: DeviceCoords): boolean {
  const ring = getCampusRing(campus);
  if (ring) {
    return isPointInPolygon(ring, coords);
  }

  const { northEast, southWest } = campus.bounds;

  return (
    coords.latitude >= southWest.latitude &&
    coords.latitude <= northEast.latitude &&
    coords.longitude >= southWest.longitude &&
    coords.longitude <= northEast.longitude
  );
}

export function distanceToCampusMeters(campus: CampusLike, coords: DeviceCoords): number {
  if (isPointWithinCampusBounds(campus, coords)) {
    return 0;
  }

  const ring = getCampusRing(campus);
  if (ring) {
    return distanceToPolygonMeters(ring, coords);
  }

  const clampedLatitude = clamp(coords.latitude, campus.bounds.southWest.latitude, campus.bounds.northEast.latitude);
  const clampedLongitude = clamp(coords.longitude, campus.bounds.southWest.longitude, campus.bounds.northEast.longitude);

  return haversineM(
    coords.latitude,
    coords.longitude,
    clampedLatitude,
    clampedLongitude,
  );
}

export function selectCampusForCoords<T extends CampusLike>(
  campuses: T[],
  coords: DeviceCoords | null,
  nearbyRadiusMeters: number,
): CampusSelection<T> | null {
  if (campuses.length === 0 || !coords) {
    return null;
  }

  let nearest = campuses[0];
  let nearestDistance = distanceToCampusMeters(nearest, coords);

  for (const campus of campuses.slice(1)) {
    const distance = distanceToCampusMeters(campus, coords);
    if (distance < nearestDistance) {
      nearest = campus;
      nearestDistance = distance;
    }
  }

  return {
    selectedCampus: nearestDistance <= nearbyRadiusMeters ? nearest : null,
    nearestCampus: nearest,
    nearestDistanceMeters: nearestDistance,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCampusRing(campus: CampusLike): [number, number][] | null {
  const vertices = campus.footprint?.filter((point): point is [number, number] => (
    Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && Math.abs(point[0]) <= 180
      && Math.abs(point[1]) <= 90
  )) ?? [];

  if (vertices.length < 3) {
    return null;
  }

  const ring = [...vertices];
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }

  return ring.length >= 4 ? ring : null;
}

function isPointInPolygon(ring: [number, number][], coords: DeviceCoords): boolean {
  const x = coords.longitude;
  const y = coords.latitude;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToPolygonMeters(ring: [number, number][], coords: DeviceCoords): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const distance = distanceToSegmentMeters(ring[index], ring[index + 1], coords);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return Number.isFinite(minDistance) ? minDistance : 0;
}

function distanceToSegmentMeters(
  start: [number, number],
  end: [number, number],
  coords: DeviceCoords,
): number {
  const originLatRad = (coords.latitude * Math.PI) / 180;
  const metersPerLng = 111_320 * Math.cos(originLatRad);
  const metersPerLat = 110_540;

  const pointX = (coords.longitude - start[0]) * metersPerLng;
  const pointY = (coords.latitude - start[1]) * metersPerLat;
  const segX = (end[0] - start[0]) * metersPerLng;
  const segY = (end[1] - start[1]) * metersPerLat;
  const segLenSq = segX * segX + segY * segY;

  if (segLenSq === 0) {
    return Math.hypot(pointX, pointY);
  }

  const t = clamp((pointX * segX + pointY * segY) / segLenSq, 0, 1);
  const projX = segX * t;
  const projY = segY * t;

  return Math.hypot(pointX - projX, pointY - projY);
}
