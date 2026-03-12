import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Feature } from 'geojson';
import { tabColors } from '@echoecho/ui';
import { useCampusStore } from '../src/stores/campusStore';
import { useAuthStore } from '../src/stores/authStore';
import { MAPBOX_STYLE_SATELLITE } from '../src/lib/mapbox';
import { useCampusBoundaryDraw } from '../src/hooks/useCampusBoundaryDraw';
import { BuildingDrawTool } from '../src/components/building/BuildingDrawTool';
import { BuildingDrawToolbar } from '../src/components/building/BuildingDrawToolbar';
import { CoordinateListInput } from '../src/components/building/CoordinateListInput';
import { CampusBoundaryLayer } from '../src/components/map/CampusBoundaryLayer';
import { createCampus, replaceCampusBoundary } from '../src/services/campusService';
import { SectionColorProvider } from '../src/contexts/SectionColorContext';

type Mode = 'create' | 'recreate';

export default function CampusBoundaryScreen() {
  return (
    <SectionColorProvider value={tabColors.map}>
      <CampusBoundaryScreenInner />
    </SectionColorProvider>
  );
}

function CampusBoundaryScreenInner() {
  const params = useLocalSearchParams<{
    mode?: Mode;
    campusId?: string;
    latitude?: string;
    longitude?: string;
    name?: string;
  }>();

  const mode: Mode = params.mode === 'recreate' ? 'recreate' : 'create';
  const { campuses, addCampus, updateCampus, setActiveCampus } = useCampusStore();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const activeCampus = useMemo(
    () => campuses.find((campus) => campus.id === params.campusId) ?? null,
    [campuses, params.campusId],
  );
  const initialCenter = useMemo<[number, number]>(() => {
    if (mode === 'recreate' && activeCampus) {
      return [activeCampus.center.longitude, activeCampus.center.latitude];
    }

    const lng = parseFloat(params.longitude ?? '');
    const lat = parseFloat(params.latitude ?? '');
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }

    return [-97.7431, 30.3150];
  }, [activeCampus, mode, params.latitude, params.longitude]);

  const [campusName, setCampusName] = useState(
    mode === 'recreate' ? activeCampus?.name ?? '' : params.name ?? '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const draw = useCampusBoundaryDraw();

  const handleMapPress = useCallback((feature: Feature) => {
    if (feature.geometry.type !== 'Point' || draw.phase !== 'drawing') return;
    draw.addVertex(feature.geometry.coordinates.slice(0, 2) as [number, number]);
  }, [draw]);

  const handleSave = useCallback(async () => {
    const trimmedName = campusName.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Enter a campus name before saving the boundary.');
      return;
    }

    if (draw.vertices.length < 3 || !draw.isClosed) {
      Alert.alert('Boundary incomplete', 'Draw at least 3 points and close the polygon before saving.');
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'recreate') {
        if (!activeCampus) {
          throw new Error('Active campus not found.');
        }

        const updatedCampus = await replaceCampusBoundary(activeCampus.id, draw.vertices);
        updateCampus(updatedCampus);
        setActiveCampus(updatedCampus);
        router.back();
        return;
      }

      const isBootstrap = campuses.length === 0;
      const createdCampus = await createCampus({
        name: trimmedName,
        footprint: draw.vertices,
        isBootstrap,
      });

      addCampus(createdCampus);
      setActiveCampus(createdCampus);

      if (isBootstrap) {
        await refreshProfile();
      }

      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  }, [
    activeCampus,
    addCampus,
    campusName,
    campuses.length,
    draw.isClosed,
    draw.vertices,
    mode,
    refreshProfile,
    setActiveCampus,
    updateCampus,
  ]);

  const title = mode === 'recreate' ? 'Recreate Boundary' : 'Create Campus Boundary';
  const subtitle = mode === 'recreate'
    ? 'Redraw the entire campus boundary. Editing the existing polygon is out of scope for this POC.'
    : 'Draw the campus perimeter on the map, or enter coordinates manually if you need an accessible fallback.';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Campus Name</Text>
        <TextInput
          style={styles.input}
          value={campusName}
          onChangeText={setCampusName}
          editable={mode === 'create'}
          placeholder="Campus name"
          placeholderTextColor="#505060"
          accessibilityLabel="Campus name"
        />
        {mode === 'recreate' && activeCampus && (
          <Text style={styles.metaText}>
            Current campus: {activeCampus.name}
          </Text>
        )}
      </View>

      <View style={styles.mapWrapper}>
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MAPBOX_STYLE_SATELLITE}
          logoEnabled={false}
          attributionPosition={{ bottom: 8, right: 8 }}
          compassEnabled
          scaleBarEnabled={false}
          accessible={false}
          onPress={handleMapPress}
        >
          <MapboxGL.Camera
            defaultSettings={{
              centerCoordinate: initialCenter,
              zoomLevel: 17,
            }}
            centerCoordinate={initialCenter}
            zoomLevel={17}
            animationMode="moveTo"
            animationDuration={0}
          />

          <MapboxGL.UserLocation visible animated />

          {mode === 'recreate' && activeCampus?.footprint?.length ? (
            <CampusBoundaryLayer
              idPrefix="campus-reference"
              vertices={activeCampus.footprint}
              lineColor="#4FC3F7"
              fillColor="#4FC3F7"
              lineOpacity={0.55}
              fillOpacity={0.1}
            />
          ) : null}

          {(draw.phase === 'drawing' || draw.phase === 'closed') && (
            <BuildingDrawTool vertices={draw.vertices} isClosed={draw.isClosed} />
          )}
        </MapboxGL.MapView>

        {draw.phase === 'drawing' && (
          <View style={styles.toolbarContainer}>
            <BuildingDrawToolbar
              phase={draw.phase}
              vertexCount={draw.vertices.length}
              onUndo={draw.undoVertex}
              onClosePolygon={draw.closePolygon}
              onCancel={draw.reset}
              onToggleCoordinateInput={draw.toggleCoordinateInput}
            />
          </View>
        )}

        {draw.showCoordinateInput && (
          <View style={styles.coordinateOverlay}>
            <CoordinateListInput
              onSubmit={draw.setVerticesFromCoordinates}
              onCancel={draw.toggleCoordinateInput}
            />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.statusRow}>
          <Ionicons name={draw.isClosed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={draw.isClosed ? '#81C784' : '#808090'} />
          <Text style={styles.statusText}>
            {draw.isClosed
              ? `Boundary ready with ${draw.vertices.length} points`
              : `${draw.vertices.length} point${draw.vertices.length === 1 ? '' : 's'} placed`}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Cancel boundary drawing"
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.iconButton,
              draw.vertices.length === 0 && styles.buttonDisabled,
              pressed && draw.vertices.length > 0 && styles.buttonPressed,
            ]}
            onPress={draw.reset}
            disabled={draw.vertices.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Reset boundary drawing"
          >
            <Ionicons
              name="refresh"
              size={18}
              color={draw.vertices.length === 0 ? '#808090' : '#D0D0DC'}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (!draw.isClosed || isSaving) && styles.buttonDisabled,
              pressed && draw.isClosed && !isSaving && styles.buttonPressed,
            ]}
            onPress={() => void handleSave()}
            disabled={!draw.isClosed || isSaving}
            accessibilityRole="button"
            accessibilityLabel={mode === 'recreate' ? 'Save recreated boundary' : 'Create campus from boundary'}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>
                  {mode === 'recreate' ? 'Replace Boundary' : 'Create Campus'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  title: {
    color: '#F0F0F5',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#808090',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: '#111116',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E26',
    padding: 14,
    gap: 8,
  },
  label: {
    color: '#A0A0B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#0D0D12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
    color: '#F0F0F5',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metaText: {
    color: '#606070',
    fontSize: 12,
  },
  mapWrapper: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E1E26',
    backgroundColor: '#050507',
  },
  map: {
    flex: 1,
  },
  toolbarContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
  },
  coordinateOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    backgroundColor: '#050507cc',
    paddingHorizontal: 8,
  },
  footer: {
    backgroundColor: '#111116',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E26',
    padding: 14,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#D0D0DC',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#D0D0DC',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 2,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: tabColors.map,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
