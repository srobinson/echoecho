/**
 * Map tab: primary admin view with 4 progressive layers + building draw mode.
 *
 * ALP-965: Four composable layers (satellite, buildings, routes, waypoints).
 * ALP-966: Building creation flow (draw polygon > metadata > entrances).
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
import { BuildingDrawTool } from '../../src/components/building/BuildingDrawTool';
import { BuildingDrawToolbar } from '../../src/components/building/BuildingDrawToolbar';
import { BuildingCreateMetadataSheet } from '../../src/components/building/BuildingCreateMetadataSheet';
import { CoordinateListInput } from '../../src/components/building/CoordinateListInput';
import { EntranceMarkingTool } from '../../src/components/building/EntranceMarkingTool';
import { EntrancePrompt } from '../../src/components/building/EntrancePrompt';
import { useCampusStore } from '../../src/stores/campusStore';
import { MAPBOX_STYLE_SATELLITE } from '../../src/lib/mapbox';
import { useAdminMapData } from '../../src/hooks/useAdminMapData';
import { useBuildingDraw } from '../../src/hooks/useBuildingDraw';
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
  const [pendingEntranceCoord, setPendingEntranceCoord] = useState<[number, number] | null>(null);
  const { activeCampus } = useCampusStore();

  const { buildings, routes, annotationWaypoints, refresh } = useAdminMapData(
    activeCampus?.id ?? null,
  );

  const draw = useBuildingDraw(activeCampus?.id ?? null);

  const center: [number, number] = activeCampus?.center
    ? [activeCampus.center.longitude, activeCampus.center.latitude]
    : TSBVI_CENTER;

  const handleClose = useCallback(() => setSelected(null), []);

  const isDrawing = draw.phase !== 'idle';

  // Handle map press depending on current mode
  const handleMapPress = useCallback((feature: GeoJSON.Feature) => {
    if (feature.geometry.type !== 'Point') return;
    const coord = feature.geometry.coordinates.slice(0, 2) as [number, number];

    if (draw.phase === 'drawing') {
      draw.addVertex(coord);
    } else if (draw.phase === 'entrances') {
      setPendingEntranceCoord(coord);
    }
  }, [draw]);

  const handleEntranceConfirm = useCallback((name: string, isMain: boolean) => {
    if (pendingEntranceCoord) {
      void draw.addEntrance(pendingEntranceCoord, name, isMain);
      setPendingEntranceCoord(null);
    }
  }, [pendingEntranceCoord, draw]);

  const handleEntranceDone = useCallback(() => {
    draw.finishEntrances();
    void refresh();
  }, [draw, refresh]);

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

  // Content slot for MapDetailPanel
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
          accessible={false}
          onPress={isDrawing ? handleMapPress : undefined}
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
              onBuildingPress={(b) => {
                if (!isDrawing) setSelected({ kind: 'building', data: b });
              }}
            />
          )}

          {activeLayers.routes && !isDrawing && (
            <RouteLayer
              routes={routes}
              onRoutePress={(r) => setSelected({ kind: 'route', data: r })}
            />
          )}

          {activeLayers.waypoints && !isDrawing && (
            <PoiLayer
              waypoints={annotationWaypoints}
              onWaypointPress={(w) => setSelected({ kind: 'waypoint', data: w })}
            />
          )}

          {/* Drawing overlay */}
          {(draw.phase === 'drawing' || draw.phase === 'closed' || draw.phase === 'metadata') && (
            <BuildingDrawTool vertices={draw.vertices} isClosed={draw.isClosed} />
          )}

          {/* Entrance markers during entrance phase */}
          {draw.phase === 'entrances' && draw.savedBuilding && (
            <EntranceMarkingTool
              polygonRing={draw.savedBuilding.footprint}
              entrances={draw.pendingEntrances}
              onAddEntrance={() => {}}
              active
            />
          )}
        </MapboxGL.MapView>

        {/* Layer controls (hidden during draw mode) */}
        {!isDrawing && (
          <View style={styles.layerControlContainer}>
            <MapLayerControl layers={activeLayers} onChange={setActiveLayers} />
          </View>
        )}

        {/* Draw toolbar */}
        {draw.phase === 'drawing' && (
          <View style={styles.drawToolbarContainer}>
            <BuildingDrawToolbar
              phase={draw.phase}
              vertexCount={draw.vertices.length}
              onUndo={draw.undoVertex}
              onClosePolygon={draw.closePolygon}
              onCancel={draw.cancel}
              onToggleCoordinateInput={draw.toggleCoordinateInput}
            />
          </View>
        )}

        {/* Coordinate input overlay */}
        {draw.showCoordinateInput && (
          <View style={styles.coordinateInputOverlay}>
            <CoordinateListInput
              onSubmit={draw.setVerticesFromCoordinates}
              onCancel={draw.toggleCoordinateInput}
            />
          </View>
        )}

        {/* Metadata form after polygon close */}
        <BuildingCreateMetadataSheet
          visible={draw.phase === 'closed' || draw.phase === 'metadata'}
          isSaving={draw.isSaving}
          onSave={(meta) => void draw.saveBuilding(meta)}
          onDiscard={draw.cancel}
        />

        {/* Entrance marking prompt */}
        {draw.phase === 'entrances' && draw.savedBuilding && (
          <View style={styles.entrancePromptContainer}>
            <EntrancePrompt
              buildingName={draw.savedBuilding.name}
              entrances={draw.pendingEntrances}
              onTapEntrance={() => {}}
              onDone={handleEntranceDone}
              pendingCoordinate={pendingEntranceCoord}
              onConfirmEntrance={handleEntranceConfirm}
              onCancelEntrance={() => setPendingEntranceCoord(null)}
            />
          </View>
        )}

        {/* FABs */}
        {!isDrawing && (
          <>
            <Pressable
              style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
              onPress={() => router.push('/record')}
              accessibilityLabel="Record a new route"
              accessibilityRole="button"
            >
              <Ionicons name="radio-button-on" size={28} color="#fff" />
              <Text style={styles.fabLabel}>Record</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.addBuildingFab, pressed && styles.fabPressed]}
              onPress={draw.startDrawing}
              accessibilityLabel="Add a new building"
              accessibilityRole="button"
            >
              <Ionicons name="business" size={22} color="#fff" />
              <Text style={styles.fabLabel}>Add Building</Text>
            </Pressable>
          </>
        )}

        {!isDrawing && (
          <MapDetailPanel
            feature={detailFeature}
            detailContent={detailContent}
            onClose={handleClose}
          />
        )}
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
  drawToolbarContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
  },
  coordinateInputOverlay: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
  },
  entrancePromptContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
  addBuildingFab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    backgroundColor: '#6c63ff',
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
