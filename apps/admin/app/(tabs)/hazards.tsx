/**
 * Hazard management tab: list and map views for campus hazards.
 * ALP-970: Filter by type/route/expiry, resolve hazards, add from map.
 */
import { useEffect, useCallback, useState, useRef, useMemo, forwardRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import MapboxGL from '@rnmapbox/maps';
import { useCampusStore } from '../../src/stores/campusStore';
import { supabase } from '../../src/lib/supabase';
import { HazardPickerSheet } from '@echoecho/ui';
import type { Hazard, HazardType, Route } from '@echoecho/shared';

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
  low: '#F59E0B',
  medium: '#F97316',
  high: '#EF4444',
};

const EXPIRY_FILTERS: { value: ExpiryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
];

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export default function HazardsScreen() {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<HazardType | null>(null);
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('active');
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [addCoordinate, setAddCoordinate] = useState<[number, number] | null>(null);

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
    void fetchHazards();
    void fetchRoutes();
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

  // Client-side expiry filtering
  const filteredHazards = useMemo(() => {
    const now = Date.now();
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
  }, [hazards, expiryFilter]);

  const handleResolve = useCallback(async (hazard: Hazard) => {
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

            if (!error) {
              AccessibilityInfo.announceForAccessibility(
                `Hazard resolved: ${HAZARD_LABELS[hazard.type]}`,
              );
              void fetchHazards();
            }
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* View mode toggle */}
      <View style={styles.header}>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => setViewMode('list')}
            accessibilityLabel="List view"
            accessibilityRole="radio"
            accessibilityState={{ selected: viewMode === 'list' }}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? '#6c63ff' : '#8888aa'} />
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
            onPress={() => setViewMode('map')}
            accessibilityLabel="Map view"
            accessibilityRole="radio"
            accessibilityState={{ selected: viewMode === 'map' }}
          >
            <Ionicons name="map" size={18} color={viewMode === 'map' ? '#6c63ff' : '#8888aa'} />
            <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>Map</Text>
          </Pressable>
        </View>
      </View>

      {/* Expiry filter chips */}
      <View style={styles.filterRow}>
        {EXPIRY_FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, expiryFilter === f.value && styles.filterChipActive]}
            onPress={() => setExpiryFilter(f.value)}
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: expiryFilter === f.value }}
          >
            <Text style={[styles.filterLabel, expiryFilter === f.value && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Type filter chips */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, !typeFilter && styles.filterChipActive]}
          onPress={() => setTypeFilter(null)}
          accessibilityLabel="All types"
          accessibilityRole="radio"
          accessibilityState={{ selected: !typeFilter }}
        >
          <Text style={[styles.filterLabel, !typeFilter && styles.filterLabelActive]}>All Types</Text>
        </Pressable>
        {(Object.keys(HAZARD_LABELS) as HazardType[]).map((type) => (
          <Pressable
            key={type}
            style={[styles.filterChip, typeFilter === type && styles.filterChipActive]}
            onPress={() => setTypeFilter(typeFilter === type ? null : type)}
            accessibilityLabel={`Type: ${HAZARD_LABELS[type]}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: typeFilter === type }}
          >
            <Ionicons name={HAZARD_ICONS[type]} size={14} color={typeFilter === type ? '#6c63ff' : '#8888aa'} />
            <Text style={[styles.filterLabel, typeFilter === type && styles.filterLabelActive]}>
              {HAZARD_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Route filter chips */}
      {routes.length > 0 && (
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, !routeFilter && styles.filterChipActive]}
            onPress={() => setRouteFilter(null)}
            accessibilityLabel="All routes"
            accessibilityRole="radio"
            accessibilityState={{ selected: !routeFilter }}
          >
            <Text style={[styles.filterLabel, !routeFilter && styles.filterLabelActive]}>All Routes</Text>
          </Pressable>
          {routes.slice(0, 5).map((r) => (
            <Pressable
              key={r.id}
              style={[styles.filterChip, routeFilter === r.id && styles.filterChipActive]}
              onPress={() => setRouteFilter(routeFilter === r.id ? null : r.id)}
              accessibilityLabel={`Route: ${r.name}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: routeFilter === r.id }}
            >
              <Text
                style={[styles.filterLabel, routeFilter === r.id && styles.filterLabelActive]}
                numberOfLines={1}
              >
                {r.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredHazards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          accessibilityRole="list"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={64} color="#2a2a3e" />
              <Text style={styles.emptyTitle}>No hazards found</Text>
              <Text style={styles.emptyBody}>
                {typeFilter || expiryFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'No active hazards on campus. Long-press the map to add one.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <HazardListItem
              hazard={item}
              routes={routes}
              onPress={() => handleSelectHazard(item)}
              onResolve={() => void handleResolve(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <View style={styles.mapContainer}>
          <MapboxGL.MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/dark-v11"
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
                    'low', '#F59E0B',
                    'medium', '#F97316',
                    'high', '#EF4444',
                    '#F97316',
                  ],
                  circleStrokeWidth: 2,
                  circleStrokeColor: '#0f0f1a',
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
                  textColor: '#e8e8f0',
                  textOffset: [0, 1.8],
                  textHaloColor: '#0f0f1a',
                  textHaloWidth: 1,
                }}
              />
            </MapboxGL.ShapeSource>
          </MapboxGL.MapView>

          <View style={styles.mapHint}>
            <Ionicons name="hand-left-outline" size={14} color="#8888aa" />
            <Text style={styles.mapHintText}>Long-press to add a hazard</Text>
          </View>
        </View>
      )}

      {/* Hazard detail sheet */}
      <HazardDetailSheet
        ref={detailRef}
        hazard={selectedHazard}
        routes={routes}
        onResolve={() => { if (selectedHazard) void handleResolve(selectedHazard); }}
        onDismiss={() => { detailRef.current?.close(); setSelectedHazard(null); }}
        onUpdateExpiry={async (hazardId, expiresAt) => {
          const { error } = await supabase
            .from('hazards')
            .update({ expires_at: expiresAt })
            .eq('id', hazardId);
          if (error) {
            Alert.alert('Update failed', error.message);
            return;
          }
          void fetchHazards();
        }}
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

// ── HazardListItem ─────────────────────────────────────────────────────────

function HazardListItem({
  hazard,
  routes,
  onPress,
  onResolve,
}: {
  hazard: Hazard;
  routes: Route[];
  onPress: () => void;
  onResolve: () => void;
}) {
  const routeName = hazard.routeId
    ? routes.find((r) => r.id === hazard.routeId)?.name ?? 'Unknown route'
    : 'Campus-wide';

  const expiryStr = hazard.expiresAt
    ? new Date(hazard.expiresAt).toLocaleDateString()
    : 'No expiry';

  const isExpiringSoon = hazard.expiresAt
    ? new Date(hazard.expiresAt).getTime() - Date.now() <= FORTY_EIGHT_HOURS_MS
      && new Date(hazard.expiresAt).getTime() > Date.now()
    : false;

  const severityColor = SEVERITY_COLOR[hazard.severity] ?? '#F97316';

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
            {isExpiringSoon ? '⚠ Expiring soon: ' : ''}{expiryStr}
          </Text>
        </View>
        <Pressable
          style={styles.resolveBtn}
          onPress={onResolve}
          accessibilityLabel={`Resolve ${HAZARD_LABELS[hazard.type]} hazard on ${routeName}`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="checkmark-circle-outline" size={24} color="#22C55E" />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── HazardDetailSheet ──────────────────────────────────────────────────────

const HazardDetailSheet = forwardRef<
  BottomSheet,
  {
    hazard: Hazard | null;
    routes: Route[];
    onResolve: () => void;
    onDismiss: () => void;
    onUpdateExpiry: (hazardId: string, expiresAt: string | null) => void;
  }
>(({ hazard, routes, onResolve, onDismiss, onUpdateExpiry }, ref) => {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} onPress={onDismiss} />
    ),
    [onDismiss],
  );

  if (!hazard) return null;

  const routeName = hazard.routeId
    ? routes.find((r) => r.id === hazard.routeId)?.name ?? 'Unknown route'
    : 'Campus-wide';

  const severityColor = SEVERITY_COLOR[hazard.severity] ?? '#F97316';

  const expiryOptions = [
    { label: 'Permanent', value: null },
    { label: '1 day', value: new Date(Date.now() + 86_400_000).toISOString() },
    { label: '1 week', value: new Date(Date.now() + 7 * 86_400_000).toISOString() },
    { label: '1 month', value: new Date(Date.now() + 30 * 86_400_000).toISOString() },
  ];

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['50%']}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: '#4a4a6a' }}
      backgroundStyle={{ backgroundColor: '#1a1a2e' }}
    >
      <BottomSheetView style={detailStyles.container}>
        <View style={detailStyles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: `${severityColor}22` }]}>
            <Ionicons name={HAZARD_ICONS[hazard.type]} size={24} color={severityColor} />
          </View>
          <View style={detailStyles.headerContent}>
            <Text style={detailStyles.title}>{hazard.title || HAZARD_LABELS[hazard.type]}</Text>
            <Text style={detailStyles.subtitle}>{routeName}</Text>
          </View>
        </View>

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
        <View style={detailStyles.expiryRow}>
          {expiryOptions.map((opt, idx) => (
            <Pressable
              key={idx}
              style={detailStyles.expiryChip}
              onPress={() => onUpdateExpiry(hazard.id, opt.value)}
              accessibilityLabel={`Set expiry: ${opt.label}`}
              accessibilityRole="button"
            >
              <Text style={detailStyles.expiryChipText}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Resolve action */}
        <Pressable
          style={detailStyles.resolveBtn}
          onPress={onResolve}
          accessibilityLabel={`Resolve ${HAZARD_LABELS[hazard.type]} hazard`}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={detailStyles.resolveBtnText}>Resolve Hazard</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
});

HazardDetailSheet.displayName = 'HazardDetailSheet';

const detailStyles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerContent: { flex: 1 },
  title: { color: '#e8e8f0', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8888aa', fontSize: 13, marginTop: 2 },
  description: { color: '#9090cc', fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaItem: { gap: 4 },
  metaLabel: {
    color: '#5555aa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: { color: '#c0c0d8', fontSize: 13 },
  sectionLabel: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  expiryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expiryChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#22223a',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    minHeight: 36,
    justifyContent: 'center',
  },
  expiryChipText: { color: '#8888aa', fontSize: 12 },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  resolveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ── Main styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
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
  toggleBtnActive: { backgroundColor: '#6c63ff22' },
  toggleText: { color: '#8888aa', fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: '#6c63ff' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#6c63ff22',
    borderColor: '#6c63ff',
  },
  filterLabel: { color: '#8888aa', fontSize: 12, fontWeight: '600' },
  filterLabelActive: { color: '#6c63ff' },
  list: { padding: 16, paddingBottom: 40 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
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
  cardTitle: { color: '#e8e8f0', fontSize: 15, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: '#8888aa', fontSize: 12 },
  severityBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  expiryText: { color: '#5555aa', fontSize: 11 },
  expiryTextWarning: { color: '#F59E0B' },
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
  emptyTitle: { color: '#8888aa', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#5555aa', fontSize: 14, textAlign: 'center', maxWidth: 280 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a2ecc',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  mapHintText: { color: '#8888aa', fontSize: 12 },
});
