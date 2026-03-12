export type LngLat = [number, number];

export function isFiniteLngLat(lng: number, lat: number): boolean {
  return Number.isFinite(lng)
    && Number.isFinite(lat)
    && Math.abs(lng) <= 180
    && Math.abs(lat) <= 90;
}

export function hasFiniteCoordinate<T extends { longitude: number; latitude: number }>(
  coordinate: T | null | undefined,
): coordinate is T {
  return coordinate != null && isFiniteLngLat(coordinate.longitude, coordinate.latitude);
}

export function toLngLat(
  coordinate: { longitude: number; latitude: number } | null | undefined,
): LngLat | null {
  if (!hasFiniteCoordinate(coordinate)) return null;
  return [coordinate.longitude, coordinate.latitude];
}

export function filterLngLatPairs(points: Array<LngLat | null | undefined>): LngLat[] {
  return points.filter((point): point is LngLat => (
    Array.isArray(point) && point.length === 2 && isFiniteLngLat(point[0], point[1])
  ));
}

export function toClosedRing(points: Array<LngLat | null | undefined>): LngLat[] | null {
  const filtered = filterLngLatPairs(points);
  if (filtered.length < 3) return null;

  const [firstLng, firstLat] = filtered[0];
  const [lastLng, lastLat] = filtered[filtered.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    filtered.push([firstLng, firstLat]);
  }

  return filtered;
}
