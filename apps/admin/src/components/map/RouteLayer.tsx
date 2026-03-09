/**
 * RouteLayer — Layer 3 of the admin map view.
 *
 * Renders route polylines as GeoJSON LineStrings, color-coded by status:
 *   draft      → #F59E0B (amber)
 *   published  → #22C55E (green)
 *   archived   → #9CA3AF (gray)
 *
 * ALP-965 spec:
 *   - LineLayer with lineWidth ≥ 8 for ≥44pt tap area
 *   - lineColor expression keyed on 'status' feature property
 *   - Tap opens MapDetailPanel with feature type discriminant 'route'
 */

import { memo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { Route } from '@echoecho/shared';

interface Props {
  routes: Route[];
  onRoutePress: (route: Route) => void;
}

const SOURCE_ID = 'admin-routes';
const LINE_LAYER_ID = 'admin-routes-lines';
const TOUCH_LAYER_ID = 'admin-routes-touch';

export const RouteLayer = memo(function RouteLayer({ routes, onRoutePress }: Props) {
  const featureCollection: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: routes
      .filter((r) => r.waypoints.length >= 2)
      .map((r): Feature<LineString> => ({
        type: 'Feature',
        id: r.id,
        properties: {
          id: r.id,
          name: r.name,
          status: r.status,
        },
        geometry: {
          type: 'LineString',
          coordinates: r.waypoints.map((w) => [
            w.coordinate.longitude,
            w.coordinate.latitude,
          ]),
        },
      })),
  };

  const colorExpression = [
    'match',
    ['get', 'status'],
    'draft', '#F59E0B',
    'published', '#22C55E',
    'archived', '#9CA3AF',
    '#9CA3AF',
  ];

  function handlePress(event: { features?: Feature[] }) {
    const feature = event.features?.[0];
    if (!feature?.properties?.id) return;
    const route = routes.find((r) => r.id === feature.properties!.id);
    if (route) onRoutePress(route);
  }

  return (
    <MapboxGL.ShapeSource
      id={SOURCE_ID}
      shape={featureCollection}
      onPress={handlePress}
    >
      <MapboxGL.LineLayer
        id={LINE_LAYER_ID}
        style={{
          lineColor: colorExpression,
          lineWidth: 4,
          lineOpacity: 0.85,
        }}
      />
      {/* Wider invisible touch target to ensure ≥44pt hit area */}
      <MapboxGL.LineLayer
        id={TOUCH_LAYER_ID}
        style={{
          lineColor: 'transparent',
          lineWidth: 20,
          lineOpacity: 0,
        }}
        belowLayerID={LINE_LAYER_ID}
      />
    </MapboxGL.ShapeSource>
  );
});
