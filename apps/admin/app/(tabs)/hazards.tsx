/**
 * Hazard management tab: list and map views for campus hazards.
 * ALP-970: Filter by type/route/expiry, resolve hazards, add from map.
 * ALP-1150: Bug fixes for map, expiry, resolve, edit/delete, filter UX.
 */
import { useEffect, useCallback, useState, useRef, useMemo, forwardRef, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import MapboxGL from '@rnmapbox/maps';
import { useCampusStore } from '../../src/stores/campusStore';
import { supabase } from '../../src/lib/supabase';
import { HazardPickerSheet } from '@echoecho/ui';
import type { Hazard, HazardType, HazardSeverity, Route } from '@echoecho/shared';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

type ViewMode = 'list' | 'map';
type ExpiryFilter = 'active' | 'expiring_soon' | 'expired' | 'all';

const HAZARD_ICONS: Record<HazardType, React.ComponentProps<typeof Ionicons>['name']> = {
  uneven_surface: 'warning-outline',
  construction: 'construct-outline',
  stairs_unmarked: 'layers-outline',
  low_clearance: 'arrow-down-outline',
  seasonal: 'calendar-outline',
  wet_surface: 'water-outline',
  other: 'alert-circle-outline',
};

const HAZARD_LABELS: Record<HazardType, string> = {
  uneven_surface: 'Uneven Surface',
  construction: 'Construction',
  stairs_unmarked: 'Unmarked Stairs',
  low_clearance: 'Low Clearance',
  seasonal: 'Seasonal',
  wet_surface: 'Wet Surface',
  other: 'Other',
};

const SEVERITY_COLOR: Record<string, string> = {
  low: '#FFB74D',
  medium: '#FFB74D',
  high: '#F06292',
};

const SEVERITY_OPTIONS: HazardSeverity[] = ['low', 'medium', 'high'];

const HAZARD_TYPE_OPTIONS: HazardType[] = [
  'uneven_surface', 'construction', 'stairs_unmarked',
  'low_clearance', 'seasonal', 'wet_surface', 'other',
];

const EXPIRY_FILTERS: { value: ExpiryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
];

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export default function HazardsScreen() {
  return (
    <SectionColorProvider value={tabColors.hazards}>
      <HazardsScreenInner />
    </SectionColorProvider>
  );
}

function HazardsScreenInner() {
  const accent = useSectionColor();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<HazardType | null>(null);
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('active');
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [addCoordinate, setAddCoordinate] = useState<[number, number] | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeCampus = useCampusStore((s) => s.activeCampus);
  const detailRef = useRef<BottomSheet>(null);
  const pickerRef = useRef<BottomSheet>(null);

  const fetchHazards = useCallback(async () => {
    if (!activeCampus) return;
    setIsLoading(true);

    let query = supabase
      .from('v_hazards' as 'hazards')
      .select('*')
      .eq('campusId' as 'campus_id', activeCampus.id)
      .order('createdAt' as 'created_at', { ascending: false });

    if (typeFilter) {
      query = query.eq('type', typeFilter);
    }
    if (routeFilter) {
      query = query.eq('routeId' as 'route_id', routeFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setHazards(data as Hazard[]);
    }
    setIsLoading(false);
  }, [activeCampus, typeFilter, routeFilter]);

  const fetchRoutes = useCallback(async () => {
    if (!activeCampus) return;
    const { data } = await supabase
      .from('v_routes' as 'routes')
      .select('id, name')
      .eq('campusId' as 'campus_id', activeCampus.id)
      .in('status', ['draft', 'published']);
    if (data) setRoutes(data as Route[]);
  }, [activeCampus]);

  useEffect(() => {
    const run = async () => {
      await fetchHazards();
      await fetchRoutes();
    };
    void run();
  }, [fetchHazards, fetchRoutes]);

  // Realtime subscription for hazard changes
  useEffect(() => {
    if (!activeCampus) return;

    const channel = supabase
      .channel('hazard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hazards', filter: `campus_id=eq.${activeCampus.id}` },
        (payload) => {
          void fetchHazards();
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as Record<string, unknown>;
            if (updated.resolved_at) {
              AccessibilityInfo.announceForAccessibility(
                `Hazard resolved: ${updated.type as string}`,
              );
            }
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [activeCampus, fetchHazards]);

  useEffect(() => {
    const id = setInterval(() => { setNowMs(Date.now()); }, 60_000);
    return () => { clearInterval(id); };
  }, []);

  // Client-side expiry filtering
  const filteredHazards = useMemo(() => {
    const now = nowMs;
    return hazards.filter((h) => {
      if (expiryFilter === 'all') return true;
      if (!h.expiresAt) return expiryFilter === 'active';

      const expiresMs = new Date(h.expiresAt).getTime();
      if (expiryFilter === 'expired') return expiresMs < now;
      if (expiryFilter === 'expiring_soon') {
        return expiresMs >= now && expiresMs - now <= FORTY_EIGHT_HOURS_MS;
      }
      // 'active'
      return expiresMs >= now;
    });
  }, [hazards, expiryFilter, nowMs]);

  const handleResolve = useCallback(async (hazard: Hazard) => {
    // Close the detail sheet first so Alert displays properly
    detailRef.current?.close();

    Alert.alert(
      'Resolve Hazard',
      `Mark "${HAZARD_LABELS[hazard.type]}" as resolved? It will no longer appear in the student app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('hazards')
              .update({ resolved_at: new Date().toISOString() })
              .eq('id', hazard.id);

            if (error) {
              Alert.alert('Resolve failed', error.message);
              return;
            }
            AccessibilityInfo.announceForAccessibility(
              `Hazard resolved: ${HAZARD_LABELS[hazard.type]}`,
            );
            setSelectedHazard(null);
            void fetchHazards();
          },
        },
      ],
    );
  }, [fetchHazards]);

  const handleDelete = useCallback(async (hazard: Hazard) => {
    detailRef.current?.close();

    Alert.alert(
      `Delete hazard?`,
      `Delete "${hazard.title || HAZARD_LABELS[hazard.type]}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('hazards')
              .delete()
              .eq('id', hazard.id);

            if (error) {
              Alert.alert('Delete failed', error.message);
              return;
            }
            AccessibilityInfo.announceForAccessibility(
              `Hazard deleted: ${hazard.title || HAZARD_LABELS[hazard.type]}`,
            );
            setSelectedHazard(null);
            void fetchHazards();
          },
        },
      ],
    );
  }, [fetchHazards]);

  const handleSelectHazard = useCallback((hazard: Hazard) => {
    setSelectedHazard(hazard);
    detailRef.current?.snapToIndex(0);
  }, []);

  const handleMapLongPress = useCallback((event: GeoJSON.Feature) => {
    if (event.geometry.type !== 'Point') return;
    const coords = event.geometry.coordinates.slice(0, 2) as [number, number];
    setAddCoordinate(coords);
    pickerRef.current?.snapToIndex(0);
  }, []);

  const handleAddHazard = useCallback(async (params: { type: HazardType; expiresAt: string | null }) => {
    if (!activeCampus || !addCoordinate) return;
    pickerRef.current?.close();

    const { error } = await supabase.from('hazards').insert({
      campus_id: activeCampus.id,
      type: params.type,
      severity: 'medium',
      coordinate: { longitude: addCoordinate[0], latitude: addCoordinate[1] },
      title: HAZARD_LABELS[params.type],
      expires_at: params.expiresAt,
    });

    if (!error) {
      AccessibilityInfo.announceForAccessibility(`Hazard added: ${HAZARD_LABELS[params.type]}`);
      void fetchHazards();
    }
    setAddCoordinate(null);
  }, [activeCampus, addCoordinate, fetchHazards]);

  const handleUpdateExpiry = useCallback(async (hazardId: string, expiresAt: string | null) => {
    const { error } = await supabase
      .from('hazards')
      .update({ expires_at: expiresAt })
      .eq('id', hazardId);

    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    // Update the selected hazard in place so the sheet reflects the change
    setSelectedHazard((prev) =>
      prev && prev.id === hazardId
        ? { ...prev, expiresAt }
        : prev,
    );
    AccessibilityInfo.announceForAccessibility(
      expiresAt ? `Expiry updated to ${new Date(expiresAt).toLocaleDateString()}` : 'Set to permanent',
    );
    void fetchHazards();
  }, [fetchHazards]);

  const handleUpdateHazard = useCallback(async (
    hazardId: string,
    updates: { description?: string | null; severity?: HazardSeverity; type?: HazardType },
  ) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.severity !== undefined) dbUpdates.severity = updates.severity;
    if (updates.type !== undefined) {
      dbUpdates.type = updates.type;
      dbUpdates.title = HAZARD_LABELS[updates.type];
    }

    const { error } = await supabase
      .from('hazards')
      .update(dbUpdates)
      .eq('id', hazardId);

    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }

    setSelectedHazard((prev) =>
      prev && prev.id === hazardId
        ? {
            ...prev,
            ...(updates.description !== undefined ? { description: updates.description } : {}),
            ...(updates.severity ? { severity: updates.severity } : {}),
            ...(updates.type ? { type: updates.type, title: HAZARD_LABELS[updates.type] } : {}),
          }
        : prev,
    );
    AccessibilityInfo.announceForAccessibility('Hazard updated.');
    void fetchHazards();
  }, [fetchHazards]);

  // GeoJSON for map hazard markers
  const hazardGeoJson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: filteredHazards.map((h) => ({
      type: 'Feature' as const,
      id: h.id,
      properties: {
        id: h.id,
        type: h.type,
        severity: h.severity,
        title: h.title,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [h.coordinate.longitude, h.coordinate.latitude],
      },
    })),
  }), [filteredHazards]);

  const renderHazardItem = useCallback(
    ({ item }: { item: Hazard }) => (
      <HazardListItem
        hazard={item}
        routes={routes}
        nowMs={nowMs}
        onPress={() => handleSelectHazard(item)}
        onResolve={() => void handleResolve(item)}
      />
    ),
    [routes, nowMs, handleSelectHazard, handleResolve],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* View mode toggle */}
      <View style={styles.header}>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: accent + '22' }]}
            onPress={() => setViewMode('list')}
            accessibilityLabel="List view"
            accessibilityRole="radio"
            accessibilityState={{ selected: viewMode === 'list' }}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? accent : '#606070'} />
            <Text style={[styles.toggleText, viewMode === 'list' && { color: accent }]}>List</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'map' && { backgroundColor: accent + '22' }]}
            onPress={() => setViewMode('map')}
            accessibilityLabel="Map view"
            accessibilityRole="radio"
            accessibilityState={{ selected: viewMode === 'map' }}
          >
            <Ionicons name="map" size={18} color={viewMode === 'map' ? accent : '#606070'} />
            <Text style={[styles.toggleText, viewMode === 'map' && { color: accent }]}>Map</Text>
          </Pressable>
        </View>
      </View>

      {/* Expiry filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {EXPIRY_FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, expiryFilter === f.value && { backgroundColor: accent + '22', borderColor: accent }]}
            onPress={() => setExpiryFilter(f.value)}
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: expiryFilter === f.value }}
          >
            <Text style={[styles.filterLabel, expiryFilter === f.value && { color: accent }]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          style={[styles.filterChip, !typeFilter && { backgroundColor: accent + '22', borderColor: accent }]}
          onPress={() => setTypeFilter(null)}
          accessibilityLabel="All types"
          accessibilityRole="radio"
          accessibilityState={{ selected: !typeFilter }}
        >
          <Text style={[styles.filterLabel, !typeFilter && { color: accent }]}>All Types</Text>
        </Pressable>
        {(Object.keys(HAZARD_LABELS) as HazardType[]).map((type) => (
          <Pressable
            key={type}
            style={[styles.filterChip, typeFilter === type && { backgroundColor: accent + '22', borderColor: accent }]}
            onPress={() => setTypeFilter(typeFilter === type ? null : type)}
            accessibilityLabel={`Type: ${HAZARD_LABELS[type]}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: typeFilter === type }}
          >
            <Ionicons name={HAZARD_ICONS[type]} size={14} color={typeFilter === type ? accent : '#606070'} />
            <Text style={[styles.filterLabel, typeFilter === type && { color: accent }]}>
              {HAZARD_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Route filter chips */}
      {routes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[styles.filterChip, !routeFilter && { backgroundColor: accent + '22', borderColor: accent }]}
            onPress={() => setRouteFilter(null)}
            accessibilityLabel="All routes"
            accessibilityRole="radio"
            accessibilityState={{ selected: !routeFilter }}
          >
            <Text style={[styles.filterLabel, !routeFilter && { color: accent }]}>All Routes</Text>
          </Pressable>
          {routes.slice(0, 5).map((r) => (
            <Pressable
              key={r.id}
              style={[styles.filterChip, routeFilter === r.id && { backgroundColor: accent + '22', borderColor: accent }]}
              onPress={() => setRouteFilter(routeFilter === r.id ? null : r.id)}
              accessibilityLabel={`Route: ${r.name}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: routeFilter === r.id }}
            >
              <Text
                style={[styles.filterLabel, routeFilter === r.id && { color: accent }]}
                numberOfLines={1}
              >
                {r.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredHazards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          accessibilityRole="list"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={64} color="#1E1E26" />
              <Text style={styles.emptyTitle}>No hazards found</Text>
              <Text style={styles.emptyBody}>
                {typeFilter || expiryFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'No active hazards on campus. Long-press the map to add one.'}
              </Text>
            </View>
          }
          renderItem={renderHazardItem}
          ItemSeparatorComponent={HazardListSeparator}
        />
      ) : (
        <View style={styles.mapContainer}>
          <MapboxGL.MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/satellite-v9"
            onLongPress={handleMapLongPress}
            accessible={false}
          >
            <MapboxGL.Camera
              defaultSettings={{
                centerCoordinate: activeCampus
                  ? [activeCampus.center.longitude, activeCampus.center.latitude]
                  : [-97.7431, 30.2672],
                zoomLevel: 16,
              }}
            />

            <MapboxGL.ShapeSource
              id="hazard-markers"
              shape={hazardGeoJson}
              onPress={(event) => {
                const feature = event.features?.[0];
                if (!feature?.properties?.id) return;
                const h = filteredHazards.find((hz) => hz.id === feature.properties!.id);
                if (h) handleSelectHazard(h);
              }}
            >
              <MapboxGL.CircleLayer
                id="hazard-circles"
                style={{
                  circleRadius: 10,
                  circleColor: [
                    'match', ['get', 'severity'],
                    'low', '#FFB74D',
                    'medium', '#FFB74D',
                    'high', '#F06292',
                    '#FFB74D',
                  ],
                  circleStrokeWidth: 2,
                  circleStrokeColor: '#0A0A0F',
                }}
              />
              <MapboxGL.SymbolLayer
                id="hazard-icons"
                style={{
                  iconImage: 'warning',
                  iconSize: 0.5,
                  iconAllowOverlap: true,
                  textField: ['get', 'title'],
                  textSize: 10,
                  textColor: '#F0F0F5',
                  textOffset: [0, 1.8],
                  textHaloColor: '#0A0A0F',
                  textHaloWidth: 1,
                }}
              />
            </MapboxGL.ShapeSource>
          </MapboxGL.MapView>

          <View style={styles.mapHint}>
            <Ionicons name="hand-left-outline" size={14} color="#606070" />
            <Text style={styles.mapHintText}>Long-press to add a hazard</Text>
          </View>
        </View>
      )}

      {/* Hazard detail sheet */}
      <HazardDetailSheet
        ref={detailRef}
        hazard={selectedHazard}
        routes={routes}
        nowMs={nowMs}
        onResolve={() => { if (selectedHazard) void handleResolve(selectedHazard); }}
        onDelete={() => { if (selectedHazard) void handleDelete(selectedHazard); }}
        onDismiss={() => { detailRef.current?.close(); }}
        onAnimationComplete={() => { setSelectedHazard(null); }}
        onUpdateExpiry={handleUpdateExpiry}
        onUpdateHazard={handleUpdateHazard}
      />

      {/* Add hazard picker (reused from packages/ui) */}
      <HazardPickerSheet
        ref={pickerRef}
        onConfirm={handleAddHazard}
        onDismiss={() => { pickerRef.current?.close(); setAddCoordinate(null); }}
      />
    </SafeAreaView>
  );
}

// ── HazardListSeparator ───────────────────────────────────────────────────

function HazardListSeparator() {
  return <View style={styles.separator} />;
}

// ── HazardListItem ─────────────────────────────────────────────────────────

const HazardListItem = memo(function HazardListItem({
  hazard,
  routes,
  nowMs,
  onPress,
  onResolve,
}: {
  hazard: Hazard;
  routes: Route[];
  nowMs: number;
  onPress: () => void;
  onResolve: () => void;
}) {
  const routeName = hazard.routeId
    ? routes.find((r) => r.id === hazard.routeId)?.name ?? 'Unknown route'
    : 'Campus-wide';

  const expiryStr = hazard.expiresAt
    ? new Date(hazard.expiresAt).toLocaleDateString()
    : 'No expiry';

  const expiresMs = hazard.expiresAt ? new Date(hazard.expiresAt).getTime() : null;
  const isExpiringSoon = expiresMs !== null
    ? expiresMs - nowMs <= FORTY_EIGHT_HOURS_MS && expiresMs > nowMs
    : false;

  const severityColor = SEVERITY_COLOR[hazard.severity] ?? '#FFB74D';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityLabel={`${HAZARD_LABELS[hazard.type]} hazard on ${routeName}, expires ${expiryStr}`}
      accessibilityRole="button"
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconCircle, { backgroundColor: `${severityColor}22` }]}>
          <Ionicons name={HAZARD_ICONS[hazard.type]} size={20} color={severityColor} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {hazard.title || HAZARD_LABELS[hazard.type]}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>{routeName}</Text>
            <View style={[styles.severityBadge, { backgroundColor: `${severityColor}22` }]}>
              <Text style={[styles.severityText, { color: severityColor }]}>
                {hazard.severity}
              </Text>
            </View>
          </View>
          <Text style={[styles.expiryText, isExpiringSoon && styles.expiryTextWarning]}>
            {isExpiringSoon ? 'Expiring soon: ' : ''}{expiryStr}
          </Text>
        </View>
        <Pressable
          style={styles.resolveBtn}
          onPress={onResolve}
          accessibilityLabel={`Resolve ${HAZARD_LABELS[hazard.type]} hazard on ${routeName}`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="checkmark-circle-outline" size={24} color="#81C784" />
        </Pressable>
      </View>
    </Pressable>
  );
});

// ── HazardDetailSheet ──────────────────────────────────────────────────────

const HazardDetailSheet = forwardRef<
  BottomSheet,
  {
    hazard: Hazard | null;
    routes: Route[];
    nowMs: number;
    onResolve: () => void;
    onDelete: () => void;
    onDismiss: () => void;
    onAnimationComplete: () => void;
    onUpdateExpiry: (hazardId: string, expiresAt: string | null) => void;
    onUpdateHazard: (hazardId: string, updates: { description?: string | null; severity?: HazardSeverity; type?: HazardType }) => void;
  }
>(({ hazard, routes, nowMs, onResolve, onDelete, onDismiss, onAnimationComplete, onUpdateExpiry, onUpdateHazard }, ref) => {
  const accent = useSectionColor();
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editSeverity, setEditSeverity] = useState<HazardSeverity>('medium');
  const [editType, setEditType] = useState<HazardType>('other');
  const [lastHazardId, setLastHazardId] = useState<string | null>(null);

  // Reset edit state when a different hazard is selected (avoids setState in effect)
  if (hazard && hazard.id !== lastHazardId) {
    setLastHazardId(hazard.id);
    setEditDescription(hazard.description ?? '');
    setEditSeverity(hazard.severity);
    setEditType(hazard.type);
    setIsEditing(false);
  }

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} onPress={onDismiss} />
    ),
    [onDismiss],
  );

  const handleClose = useCallback(() => {
    setIsEditing(false);
    onDismiss();
    onAnimationComplete();
  }, [onDismiss, onAnimationComplete]);

  const handleSaveEdits = useCallback(() => {
    if (!hazard) return;
    const updates: { description?: string | null; severity?: HazardSeverity; type?: HazardType } = {};
    if (editDescription.trim() !== (hazard.description ?? '')) {
      updates.description = editDescription.trim() || null;
    }
    if (editSeverity !== hazard.severity) {
      updates.severity = editSeverity;
    }
    if (editType !== hazard.type) {
      updates.type = editType;
    }
    if (Object.keys(updates).length > 0) {
      onUpdateHazard(hazard.id, updates);
    }
    setIsEditing(false);
  }, [hazard, editDescription, editSeverity, editType, onUpdateHazard]);

  const routeName = hazard?.routeId
    ? routes.find((r) => r.id === hazard.routeId)?.name ?? 'Unknown route'
    : 'Campus-wide';

  const severityColor = hazard ? (SEVERITY_COLOR[hazard.severity] ?? '#FFB74D') : '#FFB74D';

  const expiryOptions = [
    { label: 'Permanent', value: null },
    { label: '1 day', value: new Date(nowMs + 86_400_000).toISOString() },
    { label: '1 week', value: new Date(nowMs + 7 * 86_400_000).toISOString() },
    { label: '1 month', value: new Date(nowMs + 30 * 86_400_000).toISOString() },
  ];

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['65%']}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: '#4a4a6a' }}
      backgroundStyle={{ backgroundColor: '#111116' }}
    >
      {hazard && (
      <BottomSheetScrollView style={detailStyles.container} contentContainerStyle={detailStyles.scrollContent}>
        <View style={detailStyles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: `${severityColor}22` }]}>
            <Ionicons name={HAZARD_ICONS[hazard.type]} size={24} color={severityColor} />
          </View>
          <View style={detailStyles.headerContent}>
            <Text style={detailStyles.title}>{hazard.title || HAZARD_LABELS[hazard.type]}</Text>
            <Text style={detailStyles.subtitle}>{routeName}</Text>
          </View>
          <Pressable
            onPress={() => isEditing ? handleSaveEdits() : setIsEditing(true)}
            accessibilityLabel={isEditing ? 'Save changes' : 'Edit hazard'}
            accessibilityRole="button"
            style={[detailStyles.editToggle, { backgroundColor: accent + '22' }]}
          >
            <Ionicons name={isEditing ? 'checkmark' : 'pencil'} size={16} color={accent} />
            <Text style={[detailStyles.editToggleLabel, { color: accent }]}>
              {isEditing ? 'Save' : 'Edit'}
            </Text>
          </Pressable>
        </View>

        {isEditing ? (
          <>
            {/* Edit Type */}
            <Text style={detailStyles.sectionLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={detailStyles.chipRow}>
                {HAZARD_TYPE_OPTIONS.map((t) => (
                  <Pressable
                    key={t}
                    style={[
                      detailStyles.expiryChip,
                      editType === t && { backgroundColor: accent + '22', borderColor: accent },
                    ]}
                    onPress={() => setEditType(t)}
                    accessibilityLabel={`Type: ${HAZARD_LABELS[t]}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: editType === t }}
                  >
                    <Ionicons name={HAZARD_ICONS[t]} size={14} color={editType === t ? accent : '#606070'} />
                    <Text style={[detailStyles.expiryChipText, editType === t && { color: accent }]}>
                      {HAZARD_LABELS[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Edit Severity */}
            <Text style={detailStyles.sectionLabel}>Severity</Text>
            <View style={detailStyles.chipRow}>
              {SEVERITY_OPTIONS.map((s) => {
                const sColor = SEVERITY_COLOR[s] ?? '#FFB74D';
                return (
                  <Pressable
                    key={s}
                    style={[
                      detailStyles.expiryChip,
                      editSeverity === s && { backgroundColor: sColor + '22', borderColor: sColor },
                    ]}
                    onPress={() => setEditSeverity(s)}
                    accessibilityLabel={`Severity: ${s}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: editSeverity === s }}
                  >
                    <Text style={[
                      detailStyles.expiryChipText,
                      editSeverity === s && { color: sColor },
                    ]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Edit Description */}
            <Text style={detailStyles.sectionLabel}>Description</Text>
            <TextInput
              style={detailStyles.descriptionInput}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Optional description"
              placeholderTextColor="#404050"
              multiline
              accessibilityLabel="Hazard description"
            />

            <Pressable
              style={detailStyles.cancelBtn}
              onPress={() => {
                setEditDescription(hazard.description ?? '');
                setEditSeverity(hazard.severity);
                setEditType(hazard.type);
                setIsEditing(false);
              }}
              accessibilityLabel="Cancel editing"
              accessibilityRole="button"
            >
              <Text style={detailStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            {hazard.description && (
              <Text style={detailStyles.description}>{hazard.description}</Text>
            )}

            <View style={detailStyles.metaRow}>
              <View style={detailStyles.metaItem}>
                <Text style={detailStyles.metaLabel}>Severity</Text>
                <View style={[styles.severityBadge, { backgroundColor: `${severityColor}22` }]}>
                  <Text style={[styles.severityText, { color: severityColor }]}>
                    {hazard.severity}
                  </Text>
                </View>
              </View>
              <View style={detailStyles.metaItem}>
                <Text style={detailStyles.metaLabel}>Created</Text>
                <Text style={detailStyles.metaValue}>
                  {new Date(hazard.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={detailStyles.metaItem}>
                <Text style={detailStyles.metaLabel}>Expires</Text>
                <Text style={detailStyles.metaValue}>
                  {hazard.expiresAt ? new Date(hazard.expiresAt).toLocaleDateString() : 'Never'}
                </Text>
              </View>
            </View>

            {/* Expiry update chips */}
            <Text style={detailStyles.sectionLabel}>Update Expiry</Text>
            <View style={detailStyles.chipRow}>
              {expiryOptions.map((opt, idx) => {
                const isActive = opt.value === null
                  ? !hazard.expiresAt
                  : false;
                return (
                  <Pressable
                    key={idx}
                    style={[
                      detailStyles.expiryChip,
                      isActive && { backgroundColor: accent + '22', borderColor: accent },
                    ]}
                    onPress={() => onUpdateExpiry(hazard.id, opt.value)}
                    accessibilityLabel={`Set expiry: ${opt.label}`}
                    accessibilityRole="button"
                  >
                    <Text style={[
                      detailStyles.expiryChipText,
                      isActive && { color: accent },
                    ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Actions */}
            <View style={detailStyles.actionRow}>
              <Pressable
                style={detailStyles.resolveBtn}
                onPress={onResolve}
                accessibilityLabel={`Resolve ${HAZARD_LABELS[hazard.type]} hazard`}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={detailStyles.resolveBtnText}>Resolve</Text>
              </Pressable>

              <Pressable
                style={detailStyles.deleteBtn}
                onPress={onDelete}
                accessibilityLabel={`Delete ${HAZARD_LABELS[hazard.type]} hazard`}
                accessibilityRole="button"
              >
                <Ionicons name="trash" size={18} color="#F06292" />
                <Text style={detailStyles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </>
        )}
      </BottomSheetScrollView>
      )}
    </BottomSheet>
  );
});

HazardDetailSheet.displayName = 'HazardDetailSheet';

const detailStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerContent: { flex: 1 },
  title: { color: '#F0F0F5', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#606070', fontSize: 13, marginTop: 2 },
  editToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editToggleLabel: { fontSize: 13, fontWeight: '600' },
  description: { color: '#808090', fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaItem: { gap: 4 },
  metaLabel: {
    color: '#404050',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: { color: '#C0C0C8', fontSize: 13 },
  sectionLabel: {
    color: '#606070',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expiryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#18181F',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    minHeight: 36,
    justifyContent: 'center',
  },
  expiryChipText: { color: '#606070', fontSize: 12 },
  descriptionInput: {
    backgroundColor: '#0D0D12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
    color: '#F0F0F5',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E1E26',
  },
  cancelBtnText: { color: '#808090', fontSize: 13, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  resolveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#81C784',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  resolveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0629222',
    borderWidth: 1,
    borderColor: '#F0629244',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  deleteBtnText: { color: '#F06292', fontSize: 15, fontWeight: '700' },
});

// ── Main styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#111116',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
    overflow: 'hidden',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleBtnActive: {},
  toggleText: { color: '#606070', fontSize: 13, fontWeight: '600' },
  toggleTextActive: {},
  filterRow: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111116',
    borderWidth: 1,
    borderColor: '#1E1E26',
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: {},
  filterLabel: { color: '#606070', fontSize: 12, fontWeight: '600' },
  filterLabelActive: {},
  list: { padding: 16, paddingBottom: 40 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
    padding: 14,
  },
  cardPressed: { opacity: 0.8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { color: '#F0F0F5', fontSize: 15, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: '#606070', fontSize: 12 },
  severityBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  expiryText: { color: '#404050', fontSize: 11 },
  expiryTextWarning: { color: '#FFB74D' },
  resolveBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: { color: '#606070', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#404050', fontSize: 14, textAlign: 'center', maxWidth: 280 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111116cc',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  mapHintText: { color: '#606070', fontSize: 12 },
});
