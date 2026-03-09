/**
 * WaypointEditMode — map overlay rendering draggable PointAnnotation
 * markers and the route line during waypoint editing.
 *
 * PointAnnotation used instead of SymbolLayer because it supports
 * drag-and-drop via the `draggable` prop.
 */

import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { Waypoint } from '@echoecho/shared';

interface Props {
  waypoints: Waypoint[];
  selectedIndex: number | null;
  onWaypointPress: (index: number) => void;
  onWaypointDragEnd: (index: number, lng: number, lat: number) => void;
  onSegmentPress: (coordinate: [number, number]) => void;
}

const ROUTE_SOURCE_ID = 'edit-route-line';
const ROUTE_LINE_LAYER_ID = 'edit-route-line-layer';

const TYPE_EMOJI: Record<string, string> = {
  start: '🟢',
  end: '🔴',
  turn: '↪️',
  decision_point: '⚡',
  landmark: '🏛️',
  hazard: '⚠️',
  door: '🚪',
  elevator: '🛗',
  stairs: '🪜',
  ramp: '📐',
  crossing: '🦯',
  regular: '⬤',
};

export function WaypointEditMode({
  waypoints,
  selectedIndex,
  onWaypointPress,
  onWaypointDragEnd,
  onSegmentPress,
}: Props) {
  const routeLine: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: waypoints.length >= 2
      ? [{
          type: 'Feature',
          id: 'edit-line',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: waypoints.map((w) => [
              w.coordinate.longitude,
              w.coordinate.latitude,
            ]),
          },
        }]
      : [],
  };

  const handleSegmentPress = useCallback((event: { features?: Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coords = feature.geometry.coordinates;
    if (coords.length >= 2) {
      onSegmentPress(coords.slice(0, 2) as [number, number]);
    }
  }, [onSegmentPress]);

  return (
    <>
      {/* Route line with tap-to-insert */}
      <MapboxGL.ShapeSource
        id={ROUTE_SOURCE_ID}
        shape={routeLine}
        onPress={handleSegmentPress}
      >
        <MapboxGL.LineLayer
          id={ROUTE_LINE_LAYER_ID}
          style={{
            lineColor: '#6c63ff',
            lineWidth: 4,
            lineDasharray: [3, 2],
            lineOpacity: 0.7,
          }}
        />
        {/* Wide touch target for segment tap */}
        <MapboxGL.LineLayer
          id={`${ROUTE_LINE_LAYER_ID}-touch`}
          style={{
            lineColor: 'transparent',
            lineWidth: 24,
            lineOpacity: 0,
          }}
          belowLayerID={ROUTE_LINE_LAYER_ID}
        />
      </MapboxGL.ShapeSource>

      {/* Draggable waypoint markers */}
      {waypoints.map((w, i) => (
        <MapboxGL.PointAnnotation
          key={w.id}
          id={`edit-wp-${w.id}`}
          coordinate={[w.coordinate.longitude, w.coordinate.latitude]}
          draggable
          onDragEnd={(e) => {
            const coords = e.geometry.coordinates;
            if (coords.length >= 2) {
              onWaypointDragEnd(i, coords[0], coords[1]);
            }
          }}
          onSelected={() => onWaypointPress(i)}
        >
          <View
            style={[
              styles.marker,
              selectedIndex === i && styles.markerSelected,
            ]}
            accessible
            accessibilityLabel={`Waypoint ${i + 1}: ${w.audioLabel ?? w.type}. Draggable.`}
            accessibilityRole="button"
          >
            <Text style={styles.markerEmoji}>
              {TYPE_EMOJI[w.type] ?? '⬤'}
            </Text>
            <Text style={styles.markerIndex}>{i + 1}</Text>
          </View>
        </MapboxGL.PointAnnotation>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a2eee',
    borderWidth: 2,
    borderColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    borderColor: '#22C55E',
    backgroundColor: '#22C55E22',
    transform: [{ scale: 1.15 }],
  },
  markerEmoji: { fontSize: 14 },
  markerIndex: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#6c63ff',
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
});
