/**
 * Routes list tab — shows all recorded routes for the active campus.
 * ALP-968: Full route management (implemented in ALP-990 sprint)
 */
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouteStore } from '../../src/stores/routeStore';
import type { Route } from '@echoecho/shared';

export default function RoutesScreen() {
  const { routes, isLoading } = useRouteStore();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => (
          <RouteCard route={item} onPress={() => router.push(`/route/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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

function RouteCard({ route, onPress }: { route: Route; onPress: () => void }) {
  const statusColor =
    route.status === 'published'
      ? '#48bb78'
      : route.status === 'draft'
      ? '#ed8936'
      : '#8888aa';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityLabel={`Route: ${route.name}. Status: ${route.status}. ${route.waypoints.length} waypoints.`}
      accessibilityRole="button"
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {route.name}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {route.status}
          </Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color="#8888aa" />
          <Text style={styles.metaText}>{route.waypoints.length} waypoints</Text>
        </View>
        {route.distanceMeters != null && (
          <View style={styles.metaItem}>
            <Ionicons name="arrow-forward-outline" size={14} color="#8888aa" />
            <Text style={styles.metaText}>
              {(route.distanceMeters / 1000).toFixed(2)} km
            </Text>
          </View>
        )}
        {route.recordedDurationSec != null && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color="#8888aa" />
            <Text style={styles.metaText}>
              {Math.round(route.recordedDurationSec / 60)} min
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.routeLabels} numberOfLines={1}>
        {route.fromLabel} → {route.toLabel}
      </Text>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Ionicons name="navigate-outline" size={64} color="#2a2a3e" />
      <Text style={styles.emptyTitle}>No routes yet</Text>
      <Text style={styles.emptyBody}>
        Tap the record button to walk and capture your first route.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 80 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardPressed: { opacity: 0.8 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#e8e8f0',
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
  cardMeta: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#8888aa', fontSize: 12 },
  routeLabels: { color: '#6888aa', fontSize: 13 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e53e3e',
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
  emptyTitle: { color: '#8888aa', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#5555aa', fontSize: 14, textAlign: 'center', maxWidth: 280 },
});
