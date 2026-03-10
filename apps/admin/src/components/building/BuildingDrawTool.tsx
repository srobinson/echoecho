/**
 * BuildingDrawTool — polygon drawing overlay for the admin map.
 *
 * Collects polygon vertices via sequential map taps. Renders the in-progress
 * polygon as a dashed LineLayer with CircleLayer at each vertex. Closes the
 * polygon on first-vertex tap (within 20pt snap radius) or via explicit button.
 *
 * The polygon draw is gesture-based and inaccessible via screen reader.
 * CoordinateListInput provides the mandatory accessible alternative.
 */

import { useMemo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  vertices: [number, number][];
  isClosed: boolean;
}

const SOURCE_ID = 'building-draw';
const VERTEX_SOURCE_ID = 'building-draw-vertices';
const LINE_LAYER_ID = 'building-draw-line';
const VERTEX_LAYER_ID = 'building-draw-vertices-layer';

export function BuildingDrawTool({ vertices, isClosed }: Props) {
  const accent = useSectionColor();
  const lineCollection = useMemo((): FeatureCollection<LineString> => {
    if (vertices.length < 2) return { type: 'FeatureCollection', features: [] };

    const coords = isClosed
      ? [...vertices, vertices[0]]
      : vertices;

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'draw-polygon',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      }],
    };
  }, [vertices, isClosed]);

  const vertexCollection = useMemo((): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: vertices.map((v, i): Feature<Point> => ({
      type: 'Feature',
      id: `vertex-${i}`,
      properties: { index: i, isFirst: i === 0 },
      geometry: { type: 'Point', coordinates: v },
    })),
  }), [vertices]);

  return (
    <>
      <MapboxGL.ShapeSource id={SOURCE_ID} shape={lineCollection}>
        <MapboxGL.LineLayer
          id={LINE_LAYER_ID}
          style={{
            lineColor: isClosed ? accent : '#FFA726',
            lineWidth: 2.5,
            lineDasharray: isClosed ? undefined : [4, 3],
            lineOpacity: 0.9,
          }}
        />
      </MapboxGL.ShapeSource>

      <MapboxGL.ShapeSource id={VERTEX_SOURCE_ID} shape={vertexCollection}>
        <MapboxGL.CircleLayer
          id={VERTEX_LAYER_ID}
          style={{
            circleRadius: [
              'case',
              ['get', 'isFirst'], 8,
              5,
            ],
            circleColor: [
              'case',
              ['get', 'isFirst'], '#81C784',
              '#FFA726',
            ],
            circleStrokeColor: '#fff',
            circleStrokeWidth: 2,
            circleOpacity: 0.95,
          }}
        />
      </MapboxGL.ShapeSource>
    </>
  );
}
