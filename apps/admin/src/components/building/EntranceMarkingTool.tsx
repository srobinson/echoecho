/**
 * EntranceMarkingTool — renders entrance markers on a building polygon
 * and handles tap-to-add entrance snapping to the polygon edge.
 *
 * Uses @turf/nearest-point-on-line to compute the closest point on
 * the building polygon ring to where the user tapped.
 */

import { useMemo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Entrance } from '@echoecho/shared';

interface Props {
  /** The building polygon ring as [lng, lat][] */
  polygonRing: [number, number][];
  /** Existing entrances */
  entrances: Entrance[];
  /** Called when user taps near the polygon edge */
  onAddEntrance: (coordinate: [number, number]) => void;
  /** Whether entrance marking mode is active */
  active: boolean;
}

const SOURCE_ID = 'entrance-markers';
const SYMBOL_LAYER_ID = 'entrance-markers-layer';
const TAP_SOURCE_ID = 'entrance-tap-area';
const TAP_LINE_LAYER_ID = 'entrance-tap-line';

/**
 * Snap a tapped coordinate to the nearest point on the building polygon.
 * Returns [lng, lat].
 */
export function snapToPolygonEdge(
  polygonRing: [number, number][],
  tappedCoordinate: [number, number],
): [number, number] {
  const ring = [...polygonRing, polygonRing[0]];
  const line = lineString(ring);
  const tapped = point(tappedCoordinate);
  const snapped = nearestPointOnLine(line, tapped);
  return snapped.geometry.coordinates as [number, number];
}

export function EntranceMarkingTool({
  polygonRing,
  entrances,
  active,
}: Props) {
  const entranceCollection = useMemo((): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: entrances.map((e, i): Feature<Point> => ({
      type: 'Feature',
      id: e.id ?? `entrance-${i}`,
      properties: {
        name: e.name,
        isMain: e.isMain,
        label: e.isMain ? '★' : '⬤',
      },
      geometry: {
        type: 'Point',
        coordinates: [e.coordinate.longitude, e.coordinate.latitude],
      },
    })),
  }), [entrances]);

  // Highlight polygon edge when in marking mode
  const edgeLine = useMemo(() => {
    if (!active || polygonRing.length < 3) return null;
    const ring = [...polygonRing, polygonRing[0]];
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        id: 'entrance-edge',
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: ring },
      }],
    };
  }, [active, polygonRing]);

  return (
    <>
      {active && edgeLine && (
        <MapboxGL.ShapeSource id={TAP_SOURCE_ID} shape={edgeLine}>
          <MapboxGL.LineLayer
            id={TAP_LINE_LAYER_ID}
            style={{
              lineColor: '#81C784',
              lineWidth: 6,
              lineOpacity: 0.6,
              lineDasharray: [2, 2],
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      <MapboxGL.ShapeSource id={SOURCE_ID} shape={entranceCollection}>
        <MapboxGL.SymbolLayer
          id={SYMBOL_LAYER_ID}
          style={{
            textField: ['get', 'label'],
            textSize: 16,
            textColor: [
              'case',
              ['get', 'isMain'], '#81C784',
              '#FFA726',
            ],
            textHaloColor: '#0A0A0F',
            textHaloWidth: 1.5,
            textAnchor: 'center',
            textAllowOverlap: true,
          }}
        />
      </MapboxGL.ShapeSource>
    </>
  );
}
