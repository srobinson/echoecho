/**
 * PoiLayer — Layer 4 of the admin map view.
 *
 * Renders annotation waypoints and POIs as symbol markers.
 * Each marker type gets a distinct icon character (emoji used as fallback
 * since Mapbox sprite assets require native asset bundling).
 *
 * ALP-965 spec:
 *   - SymbolLayer with iconSize generous for ≥44pt effective hit area
 *   - Distinct icon per waypoint type
 *   - Tap opens MapDetailPanel with feature type discriminant 'waypoint'
 */

import { memo } from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Waypoint } from '@echoecho/shared';

interface Props {
  waypoints: Waypoint[];
  onWaypointPress: (waypoint: Waypoint) => void;
}

const SOURCE_ID = 'admin-pois';
const SYMBOL_LAYER_ID = 'admin-pois-symbols';

/** Emoji fallback icons per waypoint type (Mapbox sprite integration is a separate concern) */
const TYPE_EMOJI: Record<string, string> = {
  start: '🟢',
  end: '🔴',
  turn: '↩',
  decision_point: '🔀',
  landmark: '📍',
  hazard: '⚠️',
  door: '🚪',
  elevator: '🛗',
  stairs: '🪜',
  ramp: '♿',
  crossing: '🚶',
  regular: '●',
};

export const PoiLayer = memo(function PoiLayer({ waypoints, onWaypointPress }: Props) {
  const featureCollection: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: waypoints.map((w): Feature<Point> => ({
      type: 'Feature',
      id: w.id,
      properties: {
        id: w.id,
        routeId: w.routeId,
        type: w.type,
        label: w.audioLabel ?? w.type,
        emoji: TYPE_EMOJI[w.type] ?? '●',
      },
      geometry: {
        type: 'Point',
        coordinates: [w.coordinate.longitude, w.coordinate.latitude],
      },
    })),
  };

  function handlePress(event: { features?: Feature[] }) {
    const feature = event.features?.[0];
    if (!feature?.properties?.id) return;
    const waypoint = waypoints.find((w) => w.id === feature.properties!.id);
    if (waypoint) onWaypointPress(waypoint);
  }

  return (
    <MapboxGL.ShapeSource
      id={SOURCE_ID}
      shape={featureCollection}
      onPress={handlePress}
    >
      <MapboxGL.SymbolLayer
        id={SYMBOL_LAYER_ID}
        style={{
          textField: ['get', 'emoji'],
          textSize: 20,
          textAnchor: 'center',
          textAllowOverlap: false,
          textIgnorePlacement: false,
        }}
      />
    </MapboxGL.ShapeSource>
  );
});
