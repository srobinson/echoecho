import { haversineM, type Campus } from '@echoecho/shared';

interface DeviceCoords {
  latitude: number;
  longitude: number;
}

export function isPointWithinCampusBounds(campus: Campus, coords: DeviceCoords): boolean {
  const { northEast, southWest } = campus.bounds;

  return (
    coords.latitude >= southWest.latitude &&
    coords.latitude <= northEast.latitude &&
    coords.longitude >= southWest.longitude &&
    coords.longitude <= northEast.longitude
  );
}

export function distanceToCampusMeters(campus: Campus, coords: DeviceCoords): number {
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

export function selectNearestCampus(
  campuses: Campus[],
  coords: DeviceCoords,
  nearbyRadiusKm: number,
): Campus | null {
  let nearest: Campus | null = null;
  let minDistance = Infinity;

  for (const campus of campuses) {
    const distanceKm = distanceToCampusMeters(campus, coords) / 1000;
    if (distanceKm < nearbyRadiusKm && distanceKm < minDistance) {
      minDistance = distanceKm;
      nearest = campus;
    }
  }

  return nearest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
