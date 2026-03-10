/**
 * BuildingLayer — Layer 2 of the admin map view.
 *
 * Renders building footprints as GeoJSON polygons with name labels.
 * Each building is tappable to open MapDetailPanel with building info.
 *
 * ALP-965 spec:
 *   - FillLayer: semi-transparent fill over polygon
 *   - LineLayer: outline (2pt line)
 *   - SymbolLayer: building name label at polygon centroid
 *   - Tap opens MapDetailPanel with feature type discriminant 'building'
 */

import { memo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Polygon, Point } from 'geojson';
import type { Building } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  buildings: Building[];
  onBuildingPress: (building: Building) => void;
}

const SOURCE_ID = 'admin-buildings';
const FILL_LAYER_ID = 'admin-buildings-fill';
const LINE_LAYER_ID = 'admin-buildings-line';
const LABEL_LAYER_ID = 'admin-buildings-labels';
const ENTRANCE_SOURCE_ID = 'admin-building-entrances';
const ENTRANCE_CIRCLE_LAYER_ID = 'admin-building-entrances-circle';
const ENTRANCE_SYMBOL_LAYER_ID = 'admin-building-entrances-symbol';

export const BuildingLayer = memo(function BuildingLayer({ buildings, onBuildingPress }: Props) {
  const accent = useSectionColor();
  const featureCollection: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: buildings.map((b): Feature<Polygon> => ({
      type: 'Feature',
      id: b.id,
      properties: {
        id: b.id,
        name: b.name,
        category: b.category,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [b.footprint],
      },
    })),
  };

  // Label centroids — approximate centroid via averaging footprint vertices
  const labelCollection: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: buildings.map((b): Feature<Point> => ({
      type: 'Feature',
      id: `label-${b.id}`,
      properties: { name: b.name },
      geometry: {
        type: 'Point',
        coordinates: buildingCentroid(b.footprint),
      },
    })),
  };

  const entranceCollection: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: buildings.flatMap((b) =>
      (b.entrances ?? []).map((entrance): Feature<Point> => ({
        type: 'Feature',
        id: entrance.id,
        properties: {
          id: entrance.id,
          buildingId: b.id,
          name: entrance.name,
          isMain: entrance.isMain,
        },
        geometry: {
          type: 'Point',
          coordinates: [entrance.coordinate.longitude, entrance.coordinate.latitude],
        },
      })),
    ),
  };

  function handlePress(event: { features?: Feature[] }) {
    const feature = event.features?.[0];
    if (!feature?.properties?.id) return;
    const building = buildings.find((b) => b.id === feature.properties!.id);
    if (building) onBuildingPress(building);
  }

  return (
    <>
      <MapboxGL.ShapeSource
        id={SOURCE_ID}
        shape={featureCollection}
        onPress={handlePress}
      >
        <MapboxGL.FillLayer
          id={FILL_LAYER_ID}
          style={{
            fillColor: accent,
            fillOpacity: 0.15,
          }}
        />
        <MapboxGL.LineLayer
          id={LINE_LAYER_ID}
          style={{
            lineColor: accent,
            lineWidth: 2,
            lineOpacity: 0.7,
          }}
        />
      </MapboxGL.ShapeSource>

      <MapboxGL.ShapeSource id={`${SOURCE_ID}-labels`} shape={labelCollection}>
        <MapboxGL.SymbolLayer
          id={LABEL_LAYER_ID}
          style={{
            textField: ['get', 'name'],
            textSize: 12,
            textColor: '#F0F0F5',
            textHaloColor: '#0A0A0F',
            textHaloWidth: 1.5,
            textAnchor: 'center',
            textMaxWidth: 8,
          }}
        />
      </MapboxGL.ShapeSource>

      <MapboxGL.ShapeSource id={ENTRANCE_SOURCE_ID} shape={entranceCollection}>
        <MapboxGL.CircleLayer
          id={ENTRANCE_CIRCLE_LAYER_ID}
          style={{
            circleRadius: [
              'case',
              ['get', 'isMain'], 7,
              5,
            ],
            circleColor: [
              'case',
              ['get', 'isMain'], '#81C784',
              '#FFA726',
            ],
            circleStrokeColor: '#0A0A0F',
            circleStrokeWidth: 2,
            circleOpacity: 0.95,
          }}
        />
        <MapboxGL.SymbolLayer
          id={ENTRANCE_SYMBOL_LAYER_ID}
          style={{
            textField: ['case', ['get', 'isMain'], '★', ''],
            textSize: 10,
            textColor: '#0A0A0F',
            textAllowOverlap: true,
            textAnchor: 'center',
          }}
        />
      </MapboxGL.ShapeSource>
    </>
  );
});

/** Approximate centroid by averaging polygon ring vertices */
function buildingCentroid(footprint: [number, number][]): [number, number] {
  if (footprint.length === 0) return [0, 0];
  const sum = footprint.reduce(
    (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat] as [number, number],
    [0, 0] as [number, number],
  );
  return [sum[0] / footprint.length, sum[1] / footprint.length];
}
