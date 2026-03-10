/**
 * Routes list tab: route management with server-side filtering and search.
 * ALP-968: Filter by status, search by name (debounced 300ms), sort by recency.
 */
import { useEffect, useCallback, useState, useRef, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampusStore } from '../../src/stores/campusStore';
import { supabase } from '../../src/lib/supabase';
import type { Building, Route, RouteStatus } from '@echoecho/shared';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

type FilterStatus = 'all' | RouteStatus;

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'retracted', label: 'Archived' },
];

const STATUS_COLOR: Record<string, string> = {
  draft: '#FFB74D',
  published: '#81C784',
  retracted: '#9CA3AF',
  pending_save: '#9CA3AF',
};

export default function RoutesScreen() {
  return (
    <SectionColorProvider value={tabColors.routes}>
      <RoutesScreenInner />
    </SectionColorProvider>
  );
}

function RoutesScreenInner() {
  const accent = useSectionColor();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buildings, setBuildings] = useState<Map<string, Building>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const activeCampus = useCampusStore((s) => s.activeCampus);

  const fetchRoutes = useCallback(async (search: string, status: FilterStatus) => {
    if (!activeCampus) return;
    setIsLoading(true);

    let query = supabase
      .from('v_routes' as 'routes')
      .select('*')
      .eq('campusId' as 'campus_id', activeCampus.id)
      .order('updatedAt' as 'updated_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['draft', 'published', 'retracted']);
    }

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;

    if (!error) {
      const results = (data ?? []) as Route[];
      setRoutes(results);
      AccessibilityInfo.announceForAccessibility(
        results.length === 0 ? 'No routes found' : `${results.length} route${results.length === 1 ? '' : 's'} found`,
      );
    }
    setIsLoading(false);
  }, [activeCampus]);

  const fetchBuildings = useCallback(async () => {
    if (!activeCampus) return;
    const { data } = await supabase
      .from('v_buildings' as 'buildings')
      .select('*')
      .eq('campusId' as 'campus_id', activeCampus.id);
    if (data) {
      const map = new Map<string, Building>();
      for (const b of data as Building[]) {
        map.set(b.id, b);
      }
      setBuildings(map);
    }
  }, [activeCampus]);

  /* eslint-disable react-hooks/exhaustive-deps -- searchQuery excluded: search uses debounced handleSearch */
  useEffect(() => {
    void fetchRoutes(searchQuery, statusFilter);
    void fetchBuildings();
  }, [fetchRoutes, fetchBuildings, statusFilter]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const renderRouteItem = useCallback(
    ({ item }: { item: Route }) => (
      <RouteCard route={item} buildings={buildings} onPress={() => router.push(`/route/${item.id}`)} />
    ),
    [buildings],
  );

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchRoutes(text, statusFilter);
    }, 300);
  }, [fetchRoutes, statusFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#606070" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search routes..."
          placeholderTextColor="#404050"
          accessibilityLabel="Search routes by name"
          accessibilityHint="Results update as you type"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable
            onPress={() => handleSearch('')}
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color="#606070" />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, statusFilter === f.value && { backgroundColor: accent + '22', borderColor: accent }]}
            onPress={() => setStatusFilter(f.value)}
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: statusFilter === f.value }}
          >
            <Text style={[
              styles.filterLabel,
              statusFilter === f.value && { color: accent },
            ]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={accent} accessibilityLabel="Loading routes" />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState hasFilter={statusFilter !== 'all' || searchQuery.length > 0} />}
          renderItem={renderRouteItem}
          ItemSeparatorComponent={ListSeparator}
          extraData={buildings}
          accessibilityRole="list"
        />
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/record')}
        accessibilityLabel="Record a new route"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const MAX_STATIC_MAP_COORDS = 50;
const MAX_BUILDING_COORDS = 20;

/**
 * Build a GeoJSON FeatureCollection for a route and its associated buildings.
 * Used as the overlay for Mapbox Static Images API (geojson(...) format).
 */
function buildRouteGeoJson(route: Route, routeBuildings: Building[]): string {
  const features: object[] = [];

  // Building polygons — drawn beneath the route path
  for (const b of routeBuildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const fp = b.footprint;
    const step = fp.length <= MAX_BUILDING_COORDS ? 1 : Math.ceil(fp.length / MAX_BUILDING_COORDS);
    const ring: [number, number][] = fp.filter((_, i) => i % step === 0 || i === fp.length - 1);
    // Ensure the ring is closed
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([first[0], first[1]]);
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        stroke: '#00BFFF',
        'stroke-width': 2,
        'stroke-opacity': 0.9,
        fill: '#00BFFF',
        'fill-opacity': 0.15,
      },
    });
  }

  // Route LineString — drawn on top
  const wps = route.waypoints;
  const step = wps.length <= MAX_STATIC_MAP_COORDS ? 1 : Math.ceil(wps.length / MAX_STATIC_MAP_COORDS);
  const sampled = wps.filter((_, i) => i % step === 0 || i === wps.length - 1);
  features.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: sampled.map((w) => [w.coordinate.longitude, w.coordinate.latitude]),
    },
    properties: { stroke: '#6c63ff', 'stroke-width': 3, 'stroke-opacity': 0.8 },
  });

  return JSON.stringify({ type: 'FeatureCollection', features });
}

function staticMapUrl(route: Route, buildingMap?: Map<string, Building>): string | null {
  if (route.waypoints.length < 2) return null;
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  if (!token) return null;

  const routeBuildings: Building[] = [];
  if (buildingMap) {
    for (const bid of [route.fromBuildingId, route.toBuildingId]) {
      if (!bid) continue;
      const b = buildingMap.get(bid);
      if (b) routeBuildings.push(b);
    }
  }

  const geojson = buildRouteGeoJson(route, routeBuildings);
  const overlay = `geojson(${encodeURIComponent(geojson)})`;

  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${overlay}/auto/300x120@2x?padding=10&access_token=${token}`;
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const RouteCard = memo(function RouteCard({ route, buildings, onPress }: { route: Route; buildings: Map<string, Building>; onPress: () => void }) {
  const statusColor = STATUS_COLOR[route.status] ?? '#9CA3AF';
  const mapUrl = staticMapUrl(route, buildings);
  const dateStr = route.recordedAt
    ? new Date(route.recordedAt).toLocaleDateString()
    : new Date(route.createdAt).toLocaleDateString();

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityLabel={`${route.name}, ${route.status}, from ${route.fromLabel} to ${route.toLabel}, recorded ${dateStr}`}
      accessibilityRole="button"
    >
      {mapUrl && (
        <Image
          source={{ uri: mapUrl }}
          style={styles.mapPreview}
          accessible
          accessibilityLabel={`Route map: ${route.name}`}
        />
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {route.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]} accessibilityElementsHidden>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {route.status}
            </Text>
          </View>
        </View>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color="#606070" />
            <Text style={styles.metaText}>{route.waypoints.length} wp</Text>
          </View>
          {route.distanceMeters != null && (
            <View style={styles.metaItem}>
              <Ionicons name="arrow-forward-outline" size={14} color="#606070" />
              <Text style={styles.metaText}>
                {(route.distanceMeters / 1000).toFixed(2)} km
              </Text>
            </View>
          )}
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <Text style={styles.routeLabels} numberOfLines={1}>
          {route.fromLabel} → {route.toLabel}
        </Text>
      </View>
    </Pressable>
  );
});

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <View style={styles.empty} accessible accessibilityRole="alert">
      <Ionicons name="navigate-outline" size={64} color="#1E1E26" />
      <Text style={styles.emptyTitle}>
        {hasFilter ? 'No matching routes' : 'No routes yet'}
      </Text>
      <Text style={styles.emptyBody}>
        {hasFilter
          ? 'Try adjusting your search or filter.'
          : 'Tap the record button to walk and capture your first route.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111116',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
    minHeight: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#F0F0F5',
    fontSize: 15,
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111116',
    borderWidth: 1,
    borderColor: '#1E1E26',
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: {},
  filterLabel: { color: '#606070', fontSize: 13, fontWeight: '600' },
  filterLabelActive: {},
  list: { padding: 16, paddingBottom: 80 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.8 },
  mapPreview: {
    width: '100%',
    height: 100,
    backgroundColor: '#0D0D12',
  },
  cardContent: { padding: 14, gap: 6 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#F0F0F5',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardMeta: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#606070', fontSize: 12 },
  dateText: { color: '#404050', fontSize: 11, marginLeft: 'auto' },
  routeLabels: { color: '#606070', fontSize: 13 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F06292',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabPressed: { opacity: 0.85 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: '#606070', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#404050', fontSize: 14, textAlign: 'center', maxWidth: 280 },
});
