import type { Campus } from '@echoecho/shared';
import {
  distanceToCampusMeters,
  isPointWithinCampusBounds,
  selectCampusForCoords,
} from '../campusDetection';

function makeCampus(overrides: Partial<Campus> = {}): Campus {
  return {
    id: 'campus-1',
    name: 'TSBVI',
    shortName: 'TSBVI',
    center: { latitude: 30.3495, longitude: -97.7468 },
    bounds: {
      northEast: { latitude: 30.3165, longitude: -97.7370 },
      southWest: { latitude: 30.3134, longitude: -97.7418 },
    },
    defaultZoom: 16,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('campusDetection', () => {
  it('treats a point inside campus bounds as on campus even when the center is far away', () => {
    const campus = makeCampus();
    const coords = { latitude: 30.3149769, longitude: -97.7393206 };

    expect(isPointWithinCampusBounds(campus, coords)).toBe(true);
    expect(distanceToCampusMeters(campus, coords)).toBe(0);

    const selection = selectCampusForCoords([campus], coords, 1500);
    expect(selection?.selectedCampus?.id).toBe(campus.id);
    expect(selection?.nearestDistanceMeters).toBe(0);
  });

  it('uses distance to campus bounds when the user is outside the campus', () => {
    const campus = makeCampus();
    const coords = { latitude: 30.3205, longitude: -97.7393206 };

    expect(isPointWithinCampusBounds(campus, coords)).toBe(false);

    const distance = distanceToCampusMeters(campus, coords);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(500);
  });
});
