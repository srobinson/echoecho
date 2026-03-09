/**
 * Map tab — primary admin view with 4 progressive layers.
 *
 * ALP-965: Four composable layers:
 *   1. Satellite base (always on, non-toggleable)
 *   2. Building footprints — tappable, opens MapDetailPanel with BuildingEditPanel
 *   3. Route polylines — color-coded by status, opens MapDetailPanel with RoutePanel
 *   4. Waypoints / POIs — opens MapDetailPanel with waypoint info
 *
 * MapDetailPanel's `detailContent` slot is the extension point for ALP-966/967/968.
 */
import { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Text, Platform } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MapLayerControl } from '../../src/components/MapLayerControl';
import { BuildingLayer } from '../../src/components/map/BuildingLayer';
import { RouteLayer } from '../../src/components/map/RouteLayer';
import { PoiLayer } from '../../src/components/map/PoiLayer';
import { MapDetailPanel, type DetailFeature } from '../../src/components/map/MapDetailPanel';
import { BuildingEditPanel } from '../../src/components/building/BuildingEditPanel';
import { RouteDetailContent } from '../../src/components/route/RouteDetailContent';
import { WaypointDetailContent } from '../../src/components/waypoint/WaypointDetailContent';
import { useCampusStore } from '../../src/stores/campusStore';
import { MAPBOX_STYLE_SATELLITE } from '../../src/lib/mapbox';
import { useAdminMapData } from '../../src/hooks/useAdminMapData';
import type { MapLayers } from '../../src/components/MapLayerControl';
import type { Building, Route, Waypoint } from '@echoecho/shared';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const TSBVI_CENTER: [number, number] = [-97.7468, 30.3495];
const DEFAULT_ZOOM = 16;

type SelectedFeature =
  | { kind: 'building'; data: Building }
  | { kind: 'route'; data: Route }
  | { kind: 'waypoint'; data: Waypoint }
  | null;

export default function MapScreen() {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [activeLayers, setActiveLayers] = useState<MapLayers>({
    buildings: true,
    routes: true,
    waypoints: true,
  });
  const [selected, setSelected] = useState<SelectedFeature>(null);
  const { activeCampus } = useCampusStore();

  const { buildings, routes, annotationWaypoints } = useAdminMapData(
    activeCampus?.id ?? null,
  );

  const center: [number, number] = activeCampus?.center
    ? [activeCampus.center.longitude, activeCampus.center.latitude]
    : TSBVI_CENTER;

  const handleClose = useCallback(() => setSelected(null), []);

  // DetailFeature for MapDetailPanel header
  const detailFeature: DetailFeature | null = selected
    ? {
        type: selected.kind,
        id: selected.kind === 'building' ? selected.data.id
           : selected.kind === 'route' ? selected.data.id
           : selected.data.id,
        name: selected.kind === 'building' ? selected.data.name
            : selected.kind === 'route' ? selected.data.name
            : selected.data.audioLabel ?? `Waypoint ${selected.data.sequenceIndex + 1}`,
      }
    : null;

  // Content slot — extension point for ALP-966, 967, 968
  const detailContent =
    selected?.kind === 'building' ? (
      <BuildingEditPanel building={selected.data} onClose={handleClose} />
    ) : selected?.kind === 'route' ? (
      <RouteDetailContent route={selected.data} onClose={handleClose} />
    ) : selected?.kind === 'waypoint' ? (
      <WaypointDetailContent waypoint={selected.data} />
    ) : null;

  return (
    <GestureHandlerRootView style={styles.root}>
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

          {activeLayers.buildings && (
            <BuildingLayer
              buildings={buildings}
              onBuildingPress={(b) => setSelected({ kind: 'building', data: b })}
            />
          )}

          {activeLayers.routes && (
            <RouteLayer
              routes={routes}
              onRoutePress={(r) => setSelected({ kind: 'route', data: r })}
            />
          )}

          {activeLayers.waypoints && (
            <PoiLayer
              waypoints={annotationWaypoints}
              onWaypointPress={(w) => setSelected({ kind: 'waypoint', data: w })}
            />
          )}
        </MapboxGL.MapView>

        <View style={styles.layerControlContainer}>
          <MapLayerControl layers={activeLayers} onChange={setActiveLayers} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => router.push('/record')}
          accessibilityLabel="Record a new route"
          accessibilityRole="button"
        >
          <Ionicons name="radio-button-on" size={28} color="#fff" />
          <Text style={styles.fabLabel}>Record</Text>
        </Pressable>

        <MapDetailPanel
          feature={detailFeature}
          detailContent={detailContent}
          onClose={handleClose}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  map: { flex: 1 },
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
