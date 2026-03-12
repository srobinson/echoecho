import { useMemo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { FeatureCollection, Polygon } from 'geojson';
import { toClosedRing } from '../../lib/mapboxCoordinates';

interface Props {
  idPrefix: string;
  vertices: [number, number][];
  lineColor: string;
  fillColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  fillOpacity?: number;
}

export function CampusBoundaryLayer({
  idPrefix,
  vertices,
  lineColor,
  fillColor = lineColor,
  lineWidth = 2,
  lineOpacity = 0.9,
  fillOpacity = 0.12,
}: Props) {
  const shape = useMemo((): FeatureCollection<Polygon> => {
    const ring = toClosedRing(vertices);
    if (!ring) {
      return { type: 'FeatureCollection', features: [] };
    }

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: `${idPrefix}-polygon`,
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      }],
    };
  }, [idPrefix, vertices]);

  return (
    <MapboxGL.ShapeSource id={`${idPrefix}-source`} shape={shape}>
      <MapboxGL.FillLayer
        id={`${idPrefix}-fill`}
        style={{
          fillColor,
          fillOpacity,
        }}
      />
      <MapboxGL.LineLayer
        id={`${idPrefix}-line`}
        style={{
          lineColor,
          lineWidth,
          lineOpacity,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}
