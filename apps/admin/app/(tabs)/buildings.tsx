/**
 * Buildings tab: list campus buildings with category filter and search.
 * ALP-1046: Replace non-functional stub with a proper building list.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampusStore } from '../../src/stores/campusStore';
import { supabase } from '../../src/lib/supabase';
import type { Building, BuildingCategory } from '@echoecho/shared';

type FilterCategory = 'all' | BuildingCategory;

const CATEGORY_FILTERS: { value: FilterCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'academic', label: 'Academic' },
  { value: 'residential', label: 'Residential' },
  { value: 'dining', label: 'Dining' },
  { value: 'administrative', label: 'Admin' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'medical', label: 'Medical' },
  { value: 'outdoor', label: 'Outdoor' },
];

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  academic: 'school-outline',
  residential: 'home-outline',
  dining: 'restaurant-outline',
  administrative: 'briefcase-outline',
  athletic: 'fitness-outline',
  medical: 'medkit-outline',
  utility: 'construct-outline',
  outdoor: 'leaf-outline',
  other: 'business-outline',
};

export default function BuildingsScreen() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const activeCampus = useCampusStore((s) => s.activeCampus);

  const fetchBuildings = useCallback(async (search: string, category: FilterCategory) => {
    if (!activeCampus) return;
    setIsLoading(true);
    setError(null);

    let query = supabase
      .from('v_buildings' as 'buildings')
      .select('*')
      .eq('campusId' as 'campus_id', activeCampus.id)
      .order('name' as 'name', { ascending: true });

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setBuildings((data ?? []) as Building[]);
    }
    setIsLoading(false);
  }, [activeCampus]);

  useEffect(() => {
    void fetchBuildings(searchQuery, categoryFilter);
  }, [fetchBuildings, categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- searchQuery excluded: uses debounced handleSearch

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchBuildings(text, categoryFilter);
    }, 300);
  }, [fetchBuildings, categoryFilter]);

  const renderBuildingItem = useCallback(
    ({ item }: { item: Building }) => <BuildingCard building={item} />,
    [],
  );

  if (!activeCampus) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Ionicons name="business-outline" size={64} color="#2a2a3e" />
          <Text style={styles.emptyTitle}>No campus selected</Text>
          <Text style={styles.emptyBody}>
            Select a campus in Settings to manage buildings.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#8888aa" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search buildings..."
          placeholderTextColor="#5555aa"
          accessibilityLabel="Search buildings by name"
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
            <Ionicons name="close-circle" size={18} color="#8888aa" />
          </Pressable>
        )}
      </View>

      <FlatList
        data={CATEGORY_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <Pressable
            style={[styles.filterChip, categoryFilter === f.value && styles.filterChipActive]}
            onPress={() => setCategoryFilter(f.value)}
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: categoryFilter === f.value }}
          >
            <Text style={[
              styles.filterLabel,
              categoryFilter === f.value && styles.filterLabelActive,
            ]}>
              {f.label}
            </Text>
          </Pressable>
        )}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#F87171" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void fetchBuildings(searchQuery, categoryFilter)}
            accessibilityLabel="Retry loading buildings"
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      ) : (
        <FlatList
          data={buildings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState hasFilter={categoryFilter !== 'all' || searchQuery.length > 0} />
          }
          renderItem={renderBuildingItem}
          ItemSeparatorComponent={Separator}
          accessibilityRole="list"
        />
      )}
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const BuildingCard = memo(function BuildingCard({ building }: { building: Building }) {
  const icon = CATEGORY_ICON[building.category] ?? 'business-outline';
  const entranceCount = building.entrances?.length ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardIconContainer}>
        <Ionicons name={icon} size={28} color="#6c63ff" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {building.name}
        </Text>
        {building.shortName && building.shortName !== building.name && (
          <Text style={styles.cardShortName} numberOfLines={1}>
            {building.shortName}
          </Text>
        )}
        <View style={styles.cardMeta}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{building.category}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="enter-outline" size={14} color="#8888aa" />
            <Text style={styles.metaText}>
              {entranceCount} {entranceCount === 1 ? 'entrance' : 'entrances'}
            </Text>
          </View>
          {building.floor != null && (
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={14} color="#8888aa" />
              <Text style={styles.metaText}>
                {building.floor} {building.floor === 1 ? 'floor' : 'floors'}
              </Text>
            </View>
          )}
        </View>
        {building.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {building.description}
          </Text>
        )}
      </View>
    </View>
  );
});

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="business-outline" size={64} color="#2a2a3e" />
      <Text style={styles.emptyTitle}>
        {hasFilter ? 'No matching buildings' : 'No buildings yet'}
      </Text>
      <Text style={styles.emptyBody}>
        {hasFilter
          ? 'Try adjusting your search or filter.'
          : 'Use the Map tab to draw and add buildings to this campus.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    minHeight: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#e8e8f0',
    fontSize: 15,
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  filterRow: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
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
  filterLabel: { color: '#8888aa', fontSize: 13, fontWeight: '600' },
  filterLabelActive: { color: '#6c63ff' },
  list: { padding: 16, paddingBottom: 32 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6c63ff14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: {
    color: '#e8e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  cardShortName: {
    color: '#8888aa',
    fontSize: 12,
  },
  cardMeta: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#6c63ff22',
  },
  categoryText: { color: '#6c63ff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#8888aa', fontSize: 12 },
  cardDescription: { color: '#6888aa', fontSize: 13, marginTop: 2 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a2020',
  },
  errorText: { color: '#F87171', fontSize: 13, flex: 1 },
  retryText: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: '#8888aa', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#5555aa', fontSize: 14, textAlign: 'center', maxWidth: 280 },
});
