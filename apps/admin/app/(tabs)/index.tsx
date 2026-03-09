/**
 * Map tab — the primary admin view.
 *
 * Layers (progressive, toggled by the layer control):
 *   1. Satellite base (always visible)
 *   2. Building footprints
 *   3. Route polylines
 *   4. Waypoints + POIs
 *
 * ALP-943: Mapbox satellite base layer
 * ALP-965: Full 4-layer progressive map (wired here, implemented in ALP-990)
 */
import { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Text, Platform } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapLayerControl } from '../../src/components/MapLayerControl';
import { useCampusStore } from '../../src/stores/campusStore';
import { MAPBOX_STYLE_SATELLITE } from '../../src/lib/mapbox';
import type { MapLayers } from '../../src/components/MapLayerControl';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const TSBVI_CENTER: [number, number] = [-97.7468, 30.3495]; // TSBVI Austin
const DEFAULT_ZOOM = 16;

export default function MapScreen() {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [activeLayers, setActiveLayers] = useState<MapLayers>({
    buildings: true,
    routes: true,
    waypoints: true,
  });
  const { activeCampus } = useCampusStore();

  const handleRecordPress = useCallback(() => {
    router.push('/record');
  }, []);

  const center: [number, number] = activeCampus?.center
    ? [activeCampus.center.longitude, activeCampus.center.latitude]
    : TSBVI_CENTER;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MAPBOX_STYLE_SATELLITE}
        logoEnabled={false}
        attributionPosition={{ bottom: 8, right: 8 }}
        compassEnabled
        compassFadeWhenNorth
        scaleBarEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={center}
          zoomLevel={DEFAULT_ZOOM}
          animationMode="flyTo"
          animationDuration={1200}
        />

        {/* Layer 2: Building footprints — rendered when layer is active */}
        {activeLayers.buildings && <BuildingFootprintsLayer />}

        {/* Layer 3: Route polylines */}
        {activeLayers.routes && <RouteLinesLayer />}

        {/* Layer 4: Waypoints and POIs */}
        {activeLayers.waypoints && <WaypointMarkersLayer />}
      </MapboxGL.MapView>

      {/* Layer toggle control (top-right) */}
      <View style={styles.layerControlContainer}>
        <MapLayerControl layers={activeLayers} onChange={setActiveLayers} />
      </View>

      {/* Record FAB (bottom-right) */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={handleRecordPress}
        accessibilityLabel="Record a new route"
        accessibilityRole="button"
      >
        <Ionicons name="radio-button-on" size={28} color="#fff" />
        <Text style={styles.fabLabel}>Record</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/** Placeholder — replaced by ALP-966 implementation */
function BuildingFootprintsLayer() {
  return null;
}

/** Placeholder — replaced by ALP-965/967 implementations */
function RouteLinesLayer() {
  return null;
}

/** Placeholder — replaced by ALP-967 implementation */
function WaypointMarkersLayer() {
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  map: {
    flex: 1,
  },
  layerControlContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    right: 16,
    backgroundColor: '#e53e3e',
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    gap: 8,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  fabLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
