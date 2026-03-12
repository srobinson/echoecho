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
