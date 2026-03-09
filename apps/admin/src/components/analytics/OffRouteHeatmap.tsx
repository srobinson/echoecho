import { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_STYLE_SATELLITE } from '../../lib/mapbox';
import type { OffRoutePoint } from '@echoecho/shared';

interface Props {
  data: OffRoutePoint[];
  center: [number, number];
}

/**
 * Heatmap layer showing aggregated off-route events.
 * Color ramp uses a Blues sequential palette (color-blind safe).
 */
export function OffRouteHeatmap({ data, center }: Props) {
  const geojson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: data.map((p, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: { weight: p.weight },
      geometry: {
        type: 'Point' as const,
        coordinates: p.coordinates,
      },
    })),
  }), [data]);

  if (data.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Off-Route Heatmap</Text>
        <Text style={styles.emptyText}>No off-route data available yet.</Text>
      </View>
    );
  }

  const sorted = [...data].sort((a, b) => b.weight - a.weight).slice(0, 10);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Off-Route Heatmap</Text>
      <Text style={styles.subtitle}>Where students go off-route most often</Text>

      <View style={styles.mapContainer} accessible={false}>
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MAPBOX_STYLE_SATELLITE}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          accessible={false}
          accessibilityLabel="Off-route heatmap"
        >
          <MapboxGL.Camera
            defaultSettings={{
              centerCoordinate: center,
              zoomLevel: 15.5,
            }}
          />

          <MapboxGL.ShapeSource id="offroute-heatmap-source" shape={geojson}>
            <MapboxGL.HeatmapLayer
              id="offroute-heatmap-layer"
              style={{
                heatmapWeight: [
                  'interpolate', ['linear'], ['get', 'weight'],
                  0, 0,
                  10, 1,
                ],
                heatmapIntensity: [
                  'interpolate', ['linear'], ['zoom'],
                  13, 1,
                  18, 3,
                ],
                heatmapColor: [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0, 'rgba(239,243,255,0)',
                  0.2, 'rgb(198,219,239)',
                  0.4, 'rgb(158,202,225)',
                  0.6, 'rgb(107,174,214)',
                  0.8, 'rgb(49,130,189)',
                  1, 'rgb(8,81,156)',
                ],
                heatmapRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  13, 15,
                  18, 30,
                ],
                heatmapOpacity: 0.8,
              }}
            />
          </MapboxGL.ShapeSource>
        </MapboxGL.MapView>
      </View>

      {/* Screen reader table of top off-route areas */}
      <FlatList
        data={sorted}
        keyExtractor={(_, i) => String(i)}
        style={styles.srTable}
        accessibilityRole="list"
        accessibilityLabel="Top off-route areas"
        renderItem={({ item, index }) => (
          <Text
            style={styles.srRow}
            accessibilityLabel={`Area ${index + 1}: coordinates ${item.coordinates[1].toFixed(4)}, ${item.coordinates[0].toFixed(4)}, weight ${item.weight}`}
          >
            Area {index + 1}: {item.weight} events
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 16,
    gap: 8,
  },
  title: { color: '#e8e8f0', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#8888aa', fontSize: 12 },
  emptyText: { color: '#5555aa', fontSize: 13, paddingVertical: 16 },
  mapContainer: {
    height: 240,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  map: { flex: 1 },
  srTable: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  srRow: { color: '#e8e8f0', fontSize: 1 },
});
