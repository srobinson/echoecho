/**
 * RouteDetailScreen: full route management with metadata editing, actions,
 * static map preview, and version history (read-only).
 * ALP-968.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '../../src/lib/supabase';
import type { Building, Route, RouteStatus, Waypoint, WaypointType } from '@echoecho/shared';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { RoutePreviewMap } from '../../src/components/route/RoutePreviewMap';
import { publishRoute, retractRoute, deleteRoute } from '../../src/services/routeSaveService';

import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

const STATUS_COLOR: Record<string, string> = {
  draft: '#FFB74D',
  published: '#81C784',
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

type RouteConfirmAction =
  | { kind: 'status'; nextStatus: RouteStatus; title: string; message: string; confirmLabel: string }
  | { kind: 'delete'; title: string; message: string; confirmLabel: string }
  | null;

export default function RouteDetailScreen() {
  return (
    <SectionColorProvider value={tabColors.routes}>
      <RouteDetailScreenInner />
    </SectionColorProvider>
  );
}

function RouteDetailScreenInner() {
  const accent = useSectionColor();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [route, setRoute] = useState<Route | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [versions, setVersions] = useState<RouteVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<RouteConfirmAction>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Inline edit state
  const [editName, setEditName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchRoute = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('v_routes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      setLoadError(error.message);
    } else if (!data) {
      setLoadError('Route not found.');
    } else {
      const r = data as Route;
      setRoute(r);
      setEditName(r.name);

      // Fetch buildings for map overlay
      const buildingIds = [r.fromBuildingId, r.toBuildingId].filter(Boolean) as string[];
      if (buildingIds.length > 0) {
        const { data: bData } = await supabase
          .from('v_buildings' as 'buildings')
          .select('*')
          .in('id', buildingIds);
        if (bData) setBuildings(bData as Building[]);
      }
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    const run = async () => { await fetchRoute(); };
    void run();
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
      })
      .eq('id', route.id);

    setIsSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setRoute({ ...route, name: editName.trim() });
    setIsEditing(false);
  }, [route, editName]);

  const handleStatusChange = useCallback(async (newStatus: RouteStatus) => {
    if (!route) return;
    const label = newStatus === 'published' ? 'Publish' : newStatus === 'retracted' ? 'Archive' : 'Update';
    setConfirmAction({
      kind: 'status',
      nextStatus: newStatus,
      title: `${label} route?`,
      message: `Change status of "${route.name}" to ${newStatus}.`,
      confirmLabel: label,
    });
  }, [route]);

  const handleDelete = useCallback(() => {
    if (!route) return;
    setConfirmAction({
      kind: 'delete',
      title: `Delete "${route.name}"?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
  }, [route]);

  const handleConfirmAction = useCallback(async () => {
    if (!route || !confirmAction) return;

    setConfirmBusy(true);
    if (confirmAction.kind === 'status') {
      let errorMessage: string | null = null;

      if (confirmAction.nextStatus === 'published') {
        const result = await publishRoute(route.id);
        if (!result.ok) errorMessage = result.error;
      } else if (confirmAction.nextStatus === 'retracted') {
        const result = await retractRoute(route.id);
        if (!result.ok) errorMessage = result.error;
      } else {
        const { error } = await supabase
          .from('routes')
          .update({ status: confirmAction.nextStatus })
          .eq('id', route.id);
        if (error) errorMessage = error.message;
      }

      setConfirmBusy(false);
      if (errorMessage) {
        Alert.alert('Failed', errorMessage);
        return;
      }
      setRoute({ ...route, status: confirmAction.nextStatus });
      setConfirmAction(null);
      AccessibilityInfo.announceForAccessibility(`Route ${confirmAction.nextStatus}.`);
      return;
    }

    const result = await deleteRoute(route.id);
    setConfirmBusy(false);
    if (!result.ok) {
      Alert.alert('Delete failed', result.error);
      return;
    }
    setConfirmAction(null);
    AccessibilityInfo.announceForAccessibility(`${route.name} deleted.`);
    router.back();
  }, [route, confirmAction]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#F06292" />
          <Text style={styles.errorTitle}>{loadError ?? 'Route not found'}</Text>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={22} color="#F0F0F5" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLOR[route.status] ?? '#9CA3AF';
  const fromBuildingName = buildings.find((b) => b.id === route.fromBuildingId)?.name ?? '';
  const toBuildingName = buildings.find((b) => b.id === route.toBuildingId)?.name ?? '';
  const fromLabel = route.fromLabel?.trim() || fromBuildingName || 'Not set';
  const toLabel = route.toLabel?.trim() || toBuildingName || 'Not set';
  const orderedWaypoints = [...route.waypoints].sort(
    (a, b) => a.sequenceIndex - b.sequenceIndex,
  );

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
            <Ionicons name="arrow-back" size={22} color="#F0F0F5" />
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

        <RoutePreviewMap route={route} buildings={buildings} height={360} interactive />

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
              style={[styles.editToggle, { backgroundColor: accent + '22' }]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[styles.editToggleLabel, { color: accent }]}>
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
            </>
          ) : (
            <>
              <MetaRow label="From" value={fromLabel} />
              <MetaRow label="To" value={toLabel} />
              {route.description && <MetaRow label="Description" value={route.description} />}
              {route.recordedAt && (
                <MetaRow label="Date" value={new Date(route.recordedAt).toLocaleDateString()} />
              )}
            </>
          )}
        </View>

        <WaypointAnnotationTable waypoints={orderedWaypoints} />

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Actions</Text>
          <View style={styles.actionGrid}>
            {route.status === 'draft' && (
              <ActionButton
                icon="cloud-upload"
                label="Publish"
                color="#81C784"
                onPress={() => void handleStatusChange('published')}
              />
            )}
            {route.status === 'published' && (
              <ActionButton
                icon="archive"
                label="Archive"
                color="#FFB74D"
                onPress={() => void handleStatusChange('retracted')}
              />
            )}
            {route.status === 'retracted' && (
              <ActionButton
                icon="refresh"
                label="Restore"
                color="#81C784"
                onPress={() => void handleStatusChange('draft')}
              />
            )}
            {/* POC: duplicate remains parked until we support copying waypoints and full route metadata. */}
            <ActionButton
              icon="trash"
              label="Delete"
              color="#F06292"
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
                color="#606070"
              />
            </Pressable>
            {showVersions && versions.map((v) => (
              <View key={v.id} style={styles.versionRow}>
                <Text style={[styles.versionNumber, { color: accent }]}>v{v.version}</Text>
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
      <ConfirmDialog
        visible={confirmAction != null}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
        destructive={confirmAction?.kind === 'delete'}
        loading={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmAction(null);
        }}
        onConfirm={() => void handleConfirmAction()}
      />
    </SafeAreaView>
  );
}

const AUDIO_BUCKET = 'route-audio';

const WAYPOINT_TYPE_LABEL: Record<WaypointType, string> = {
  start: 'Start',
  end: 'End',
  turn: 'Turn',
  decision_point: 'Decision Point',
  landmark: 'Landmark',
  hazard: 'Hazard',
  door: 'Door',
  elevator: 'Elevator',
  stairs: 'Stairs',
  ramp: 'Ramp',
  crossing: 'Crossing',
  regular: 'Waypoint',
};

function WaypointAnnotationTable({ waypoints }: { waypoints: Waypoint[] }) {
  const accent = useSectionColor();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  useEffect(() => {
    return () => {
      void stopPlayback();
    };
  }, [stopPlayback]);

  const handleToggleAudio = useCallback(async (waypoint: Waypoint) => {
    if (!waypoint.audioAnnotationUrl) return;

    if (playingId === waypoint.id) {
      await stopPlayback();
      return;
    }

    setLoadingId(waypoint.id);
    try {
      await stopPlayback();
      const audioUri = await resolveWaypointAudioUrl(waypoint.audioAnnotationUrl);
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            void stopPlayback();
          }
        },
      );

      soundRef.current = sound;
      setPlayingId(waypoint.id);
    } catch (error) {
      Alert.alert(
        'Playback unavailable',
        error instanceof Error ? error.message : 'Unable to play this audio annotation.',
      );
    } finally {
      setLoadingId((current) => (current === waypoint.id ? null : current));
    }
  }, [playingId, stopPlayback]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Waypoint Annotations</Text>
      {waypoints.length === 0 ? (
        <Text style={styles.emptySectionText}>No waypoints recorded for this route yet.</Text>
      ) : (
        <View style={styles.annotationTable}>
          <View style={styles.annotationHeaderRow}>
            <Text style={[styles.annotationHeaderCell, styles.annotationStepCol]}>#</Text>
            <Text style={[styles.annotationHeaderCell, styles.annotationTypeCol]}>Type</Text>
            <Text style={[styles.annotationHeaderCell, styles.annotationTranscriptCol]}>Transcript</Text>
            <Text style={[styles.annotationHeaderCell, styles.annotationAudioCol]}>Audio</Text>
          </View>
          {waypoints.map((waypoint) => {
            const hasAudio = waypoint.audioAnnotationUrl != null;
            const isLoading = loadingId === waypoint.id;
            const isPlaying = playingId === waypoint.id;
            const isAnotherClipActive =
              (playingId != null && playingId !== waypoint.id) ||
              (loadingId != null && loadingId !== waypoint.id);
            return (
              <View key={waypoint.id} style={styles.annotationRow}>
                <Text style={[styles.annotationCell, styles.annotationStepCol, styles.annotationStepText]}>
                  {waypoint.sequenceIndex + 1}
                </Text>
                <Text style={[styles.annotationCell, styles.annotationTypeCol, styles.annotationTypeText]}>
                  {WAYPOINT_TYPE_LABEL[waypoint.type] ?? waypoint.type}
                </Text>
                <View style={[styles.annotationCell, styles.annotationTranscriptCol]}>
                  <Text style={styles.annotationTranscriptText}>
                    {waypoint.audioLabel?.trim() || 'No transcript'}
                  </Text>
                </View>
                <View style={[styles.annotationCell, styles.annotationAudioCol]}>
                  {hasAudio ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.audioButton,
                        { borderColor: accent + '44', backgroundColor: accent + '18' },
                        isAnotherClipActive && styles.audioButtonDisabled,
                        pressed && styles.audioButtonPressed,
                      ]}
                      onPress={() => void handleToggleAudio(waypoint)}
                      disabled={isAnotherClipActive}
                      accessibilityRole="button"
                      accessibilityLabel={`${isPlaying ? 'Stop' : 'Play'} audio for waypoint ${waypoint.sequenceIndex + 1}`}
                      accessibilityState={{ disabled: isAnotherClipActive }}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={accent} />
                      ) : (
                        <>
                          <Ionicons
                            name={isPlaying ? 'stop-circle' : 'play-circle'}
                            size={18}
                            color={accent}
                          />
                          <Text style={[styles.audioButtonLabel, { color: accent }]}>
                            {isPlaying ? 'Playing' : 'Play'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Text style={styles.annotationEmptyAudio}>No audio</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

async function resolveWaypointAudioUrl(audioPath: string): Promise<string> {
  if (/^https?:\/\//i.test(audioPath)) return audioPath;

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(audioPath, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Audio file could not be resolved.');
  }

  return data.signedUrl;
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
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorTitle: { color: '#F06292', fontSize: 15, fontWeight: '600', textAlign: 'center', maxWidth: 280 },
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
    backgroundColor: '#111116',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, gap: 6 },
  routeName: { color: '#F0F0F5', fontSize: 20, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  mapPreview: {
    width: '100%',
    height: 360,
    backgroundColor: '#0D0D12',
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
    backgroundColor: '#111116',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  statValue: { color: '#F0F0F5', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#606070', fontSize: 10, textTransform: 'uppercase' },
  section: {
    backgroundColor: '#111116',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: '#808090', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  editToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  editToggleLabel: { fontSize: 13, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0D0D12',
  },
  metaLabel: { color: '#808090', fontSize: 12, width: 80 },
  metaValue: { color: '#F0F0F5', fontSize: 13, fontWeight: '500', flex: 1 },
  metaField: { gap: 4 },
  metaInput: {
    backgroundColor: '#0D0D12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
    color: '#F0F0F5',
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
    borderBottomColor: '#0D0D12',
  },
  versionNumber: {
    fontSize: 14,
    fontWeight: '700',
    width: 32,
  },
  versionInfo: { flex: 1, gap: 2 },
  versionDate: { color: '#F0F0F5', fontSize: 13 },
  versionMeta: { color: '#606070', fontSize: 11 },
  emptySectionText: { color: '#606070', fontSize: 13, lineHeight: 20 },
  annotationTable: {
    borderWidth: 1,
    borderColor: '#1E1E26',
    borderRadius: 12,
    overflow: 'hidden',
  },
  annotationHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0D0D12',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  annotationHeaderCell: {
    color: '#808090',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  annotationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
  },
  annotationCell: {
    justifyContent: 'center',
  },
  annotationStepCol: { width: 30 },
  annotationTypeCol: { width: 88 },
  annotationTranscriptCol: { flex: 1 },
  annotationAudioCol: { width: 86, alignItems: 'flex-end' },
  annotationStepText: { color: '#F0F0F5', fontSize: 13, fontWeight: '700' },
  annotationTypeText: { color: '#D6D6E5', fontSize: 12, fontWeight: '600' },
  annotationTranscriptText: { color: '#F0F0F5', fontSize: 13, lineHeight: 18 },
  annotationEmptyAudio: { color: '#606070', fontSize: 12, fontWeight: '600' },
  audioButton: {
    minWidth: 74,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  audioButtonPressed: { opacity: 0.72 },
  audioButtonDisabled: { opacity: 0.35 },
  audioButtonLabel: { fontSize: 12, fontWeight: '700' },
});
