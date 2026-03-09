/**
 * RouteDetailScreen: full route management with metadata editing, actions,
 * static map preview, and version history (read-only).
 * ALP-968.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  AccessibilityInfo,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import type { Route, RouteStatus } from '@echoecho/shared';

const STATUS_COLOR: Record<string, string> = {
  draft: '#F59E0B',
  published: '#22C55E',
  retracted: '#9CA3AF',
  pending_save: '#9CA3AF',
};

interface RouteVersion {
  id: string;
  version: number;
  recordedBy: string | null;
  waypointCount: number;
  createdAt: string;
}

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [route, setRoute] = useState<Route | null>(null);
  const [versions, setVersions] = useState<RouteVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // Inline edit state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchRoute = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('v_routes')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      const r = data as Route;
      setRoute(r);
      setEditName(r.name);
      setEditDescription(r.description ?? '');
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchRoute();
  }, [fetchRoute]);

  // Version history fetch (best-effort, table may not exist)
  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data } = await supabase
        .from('route_versions')
        .select('id, version, recorded_by, waypoint_count, created_at')
        .eq('route_id', id)
        .order('version', { ascending: false });
      if (data) {
        setVersions(data.map((v: Record<string, unknown>) => ({
          id: v.id as string,
          version: v.version as number,
          recordedBy: v.recorded_by as string | null,
          waypointCount: v.waypoint_count as number,
          createdAt: v.created_at as string,
        })));
      }
    })();
  }, [id]);

  const handleSaveMetadata = useCallback(async () => {
    if (!route) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('routes')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
      })
      .eq('id', route.id);

    setIsSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setRoute({ ...route, name: editName.trim(), description: editDescription.trim() || null });
    setIsEditing(false);
  }, [route, editName, editDescription]);

  const handleStatusChange = useCallback(async (newStatus: RouteStatus) => {
    if (!route) return;
    const label = newStatus === 'published' ? 'Publish' : newStatus === 'retracted' ? 'Archive' : 'Update';
    Alert.alert(
      `${label} route?`,
      `Change status of "${route.name}" to ${newStatus}.`,
      [
        {
          text: label,
          onPress: async () => {
            const { error } = await supabase
              .from('routes')
              .update({ status: newStatus })
              .eq('id', route.id);
            if (error) {
              Alert.alert('Failed', error.message);
              return;
            }
            setRoute({ ...route, status: newStatus });
            AccessibilityInfo.announceForAccessibility(`Route ${newStatus}.`);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [route]);

  const handleDuplicate = useCallback(async () => {
    if (!route) return;
    const { data, error } = await supabase
      .from('routes')
      .insert({
        campus_id: route.campusId,
        name: `${route.name} (copy)`,
        description: route.description,
        from_building_id: route.fromBuildingId,
        to_building_id: route.toBuildingId,
        from_label: route.fromLabel,
        to_label: route.toLabel,
        status: 'draft',
      })
      .select('id')
      .single();

    if (error || !data) {
      Alert.alert('Duplicate failed', error?.message ?? 'Unknown error');
      return;
    }
    Alert.alert('Duplicated', 'Route copied as draft.', [
      { text: 'View Copy', onPress: () => router.replace(`/route/${data.id}`) },
      { text: 'Stay Here' },
    ]);
  }, [route]);

  const handleDelete = useCallback(() => {
    if (!route) return;
    Alert.alert(
      `Delete "${route.name}"?`,
      'This cannot be undone.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('routes')
              .delete()
              .eq('id', route.id);
            if (error) {
              Alert.alert('Delete failed', error.message);
              return;
            }
            AccessibilityInfo.announceForAccessibility(`${route.name} deleted.`);
            router.back();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [route]);

  if (isLoading || !route) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLOR[route.status] ?? '#9CA3AF';
  const mapToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const mapUrl = route.waypoints.length >= 2 && mapToken
    ? buildStaticMapUrl(route, mapToken)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={22} color="#e8e8f0" />
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.routeName} numberOfLines={2}>
              {route.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {route.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Static map preview */}
        {mapUrl && (
          <Image
            source={{ uri: mapUrl }}
            style={styles.mapPreview}
            accessible
            accessibilityLabel={`Route map: ${route.name}`}
          />
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox value={`${route.waypoints.length}`} label="Waypoints" />
          {route.distanceMeters != null && (
            <StatBox value={`${(route.distanceMeters / 1000).toFixed(2)} km`} label="Distance" />
          )}
          {route.recordedDurationSec != null && (
            <StatBox value={`${Math.round(route.recordedDurationSec / 60)} min`} label="Walk time" />
          )}
        </View>

        {/* Metadata */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Details</Text>
            <Pressable
              onPress={() => isEditing ? void handleSaveMetadata() : setIsEditing(true)}
              disabled={isSaving}
              accessibilityLabel={isEditing ? 'Save metadata' : 'Edit metadata'}
              accessibilityRole="button"
              style={styles.editToggle}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#6c63ff" />
              ) : (
                <Text style={styles.editToggleLabel}>
                  {isEditing ? 'Save' : 'Edit'}
                </Text>
              )}
            </Pressable>
          </View>

          {isEditing ? (
            <>
              <MetaField label="Name">
                <TextInput
                  style={styles.metaInput}
                  value={editName}
                  onChangeText={setEditName}
                  accessibilityLabel="Route name"
                />
              </MetaField>
              <MetaField label="Description">
                <TextInput
                  style={[styles.metaInput, styles.metaInputMultiline]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  accessibilityLabel="Route description"
                />
              </MetaField>
            </>
          ) : (
            <>
              <MetaRow label="From" value={route.fromLabel} />
              <MetaRow label="To" value={route.toLabel} />
              {route.description && <MetaRow label="Notes" value={route.description} />}
              {route.recordedBy && <MetaRow label="Recorded by" value={route.recordedBy} />}
              {route.recordedAt && (
                <MetaRow label="Date" value={new Date(route.recordedAt).toLocaleDateString()} />
              )}
            </>
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Actions</Text>
          <View style={styles.actionGrid}>
            {route.status === 'draft' && (
              <ActionButton
                icon="cloud-upload"
                label="Publish"
                color="#22C55E"
                onPress={() => void handleStatusChange('published')}
              />
            )}
            {route.status === 'published' && (
              <ActionButton
                icon="archive"
                label="Archive"
                color="#F59E0B"
                onPress={() => void handleStatusChange('retracted')}
              />
            )}
            {route.status === 'retracted' && (
              <ActionButton
                icon="refresh"
                label="Restore"
                color="#22C55E"
                onPress={() => void handleStatusChange('draft')}
              />
            )}
            <ActionButton
              icon="copy"
              label="Duplicate"
              color="#6c63ff"
              onPress={() => void handleDuplicate()}
            />
            <ActionButton
              icon="trash"
              label="Delete"
              color="#ef4444"
              onPress={handleDelete}
            />
          </View>
        </View>

        {/* Version history */}
        {versions.length > 0 && (
          <View style={styles.section}>
            <Pressable
              style={styles.accordionHeader}
              onPress={() => setShowVersions(!showVersions)}
              accessibilityLabel={`Version history, ${versions.length} versions`}
              accessibilityRole="button"
            >
              <Text style={styles.sectionTitle}>Version History ({versions.length})</Text>
              <Ionicons
                name={showVersions ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#8888aa"
              />
            </Pressable>
            {showVersions && versions.map((v) => (
              <View key={v.id} style={styles.versionRow}>
                <Text style={styles.versionNumber}>v{v.version}</Text>
                <View style={styles.versionInfo}>
                  <Text style={styles.versionDate}>
                    {new Date(v.createdAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.versionMeta}>
                    {v.waypointCount} waypoints
                    {v.recordedBy ? ` by ${v.recordedBy}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const MAX_STATIC_MAP_COORDS = 50;

function buildStaticMapUrl(route: Route, token: string): string {
  const wps = route.waypoints;
  const step = wps.length <= MAX_STATIC_MAP_COORDS ? 1 : Math.ceil(wps.length / MAX_STATIC_MAP_COORDS);
  const sampled = wps.filter((_, i) => i % step === 0 || i === wps.length - 1);

  const coords = sampled.map((w) =>
    `${w.coordinate.longitude.toFixed(5)},${w.coordinate.latitude.toFixed(5)}`,
  );
  const path = `path-3+6c63ff-0.8(${encodeURIComponent(coords.join(','))})`;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const w of wps) {
    if (w.coordinate.longitude < minLng) minLng = w.coordinate.longitude;
    if (w.coordinate.longitude > maxLng) maxLng = w.coordinate.longitude;
    if (w.coordinate.latitude < minLat) minLat = w.coordinate.latitude;
    if (w.coordinate.latitude > maxLat) maxLat = w.coordinate.latitude;
  }
  const bbox = `${minLng - 0.001},${minLat - 0.001},${maxLng + 0.001},${maxLat + 0.001}`;

  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${path}/[${bbox}]/600x200@2x?access_token=${token}`;
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.metaField}>
      <Text style={styles.metaLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: `${color}22`, borderColor: `${color}44` },
        pressed && styles.actionBtnPressed,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, gap: 6 },
  routeName: { color: '#e8e8f0', fontSize: 20, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  mapPreview: {
    width: '100%',
    height: 180,
    backgroundColor: '#14142a',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  statValue: { color: '#e8e8f0', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#8888aa', fontSize: 10, textTransform: 'uppercase' },
  section: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: '#9090cc', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  editToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#6c63ff22' },
  editToggleLabel: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#14142a',
  },
  metaLabel: { color: '#9090cc', fontSize: 12, width: 80 },
  metaValue: { color: '#e8e8f0', fontSize: 13, fontWeight: '500', flex: 1 },
  metaField: { gap: 4 },
  metaInput: {
    backgroundColor: '#14142a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    color: '#e8e8f0',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  metaInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
  },
  actionBtnPressed: { opacity: 0.75 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#14142a',
  },
  versionNumber: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '700',
    width: 32,
  },
  versionInfo: { flex: 1, gap: 2 },
  versionDate: { color: '#e8e8f0', fontSize: 13 },
  versionMeta: { color: '#8888aa', fontSize: 11 },
});
