/**
 * WaypointBeforeAfterModal — structured list diff shown before save confirm.
 *
 * Two-column layout: "Before" and "After" showing waypoint sequence changes.
 * Highlights added, removed, and modified waypoints.
 */

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import type { Waypoint } from '@echoecho/shared';

interface Props {
  originalWaypoints: Waypoint[];
  editedWaypoints: Waypoint[];
  isSaving: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}

interface DiffEntry {
  index: number;
  label: string;
  type: string;
  status: 'unchanged' | 'modified' | 'added' | 'removed';
}

function buildDiff(
  original: Waypoint[],
  edited: Waypoint[],
): { before: DiffEntry[]; after: DiffEntry[] } {
  const editedById = new Map(edited.map((w) => [w.id, w]));
  const originalById = new Map(original.map((w) => [w.id, w]));

  const before: DiffEntry[] = original.map((w, i) => {
    const match = editedById.get(w.id);
    return {
      index: i,
      label: w.audioLabel ?? w.type,
      type: w.type,
      status: match ? (hasChanged(w, match) ? 'modified' : 'unchanged') : 'removed',
    };
  });

  const after: DiffEntry[] = edited.map((w, i) => {
    const match = originalById.get(w.id);
    return {
      index: i,
      label: w.audioLabel ?? w.type,
      type: w.type,
      status: match ? (hasChanged(match, w) ? 'modified' : 'unchanged') : 'added',
    };
  });

  return { before, after };
}

function hasChanged(a: Waypoint, b: Waypoint): boolean {
  return (
    a.sequenceIndex !== b.sequenceIndex ||
    a.coordinate.latitude !== b.coordinate.latitude ||
    a.coordinate.longitude !== b.coordinate.longitude ||
    a.audioLabel !== b.audioLabel ||
    a.description !== b.description ||
    a.type !== b.type
  );
}

const STATUS_COLOR: Record<string, string> = {
  unchanged: '#8888aa',
  modified: '#F59E0B',
  added: '#22C55E',
  removed: '#ef4444',
};

export function WaypointBeforeAfterModal({
  originalWaypoints,
  editedWaypoints,
  isSaving,
  onConfirm,
  onDiscard,
}: Props) {
  const { before, after } = useMemo(
    () => buildDiff(originalWaypoints, editedWaypoints),
    [originalWaypoints, editedWaypoints],
  );

  const addedCount = after.filter((e) => e.status === 'added').length;
  const removedCount = before.filter((e) => e.status === 'removed').length;
  const modifiedCount = after.filter((e) => e.status === 'modified').length;

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.title} accessibilityRole="header">
          Review Changes
        </Text>

        <Text style={styles.summary}>
          {modifiedCount > 0 ? `${modifiedCount} modified` : ''}
          {modifiedCount > 0 && addedCount > 0 ? ', ' : ''}
          {addedCount > 0 ? `${addedCount} added` : ''}
          {(modifiedCount > 0 || addedCount > 0) && removedCount > 0 ? ', ' : ''}
          {removedCount > 0 ? `${removedCount} removed` : ''}
          {modifiedCount === 0 && addedCount === 0 && removedCount === 0 ? 'No changes' : ''}
        </Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnHeader} accessibilityRole="header">
              Before ({originalWaypoints.length})
            </Text>
            <ScrollView style={styles.columnList}>
              {before.map((entry) => (
                <DiffRow key={`before-${entry.index}`} entry={entry} />
              ))}
            </ScrollView>
          </View>

          <View style={styles.divider} />

          <View style={styles.column}>
            <Text style={styles.columnHeader} accessibilityRole="header">
              After ({editedWaypoints.length})
            </Text>
            <ScrollView style={styles.columnList}>
              {after.map((entry) => (
                <DiffRow key={`after-${entry.index}`} entry={entry} />
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.discardBtn}
            onPress={onDiscard}
            disabled={isSaving}
            accessibilityLabel="Discard changes and continue editing"
            accessibilityRole="button"
          >
            <Text style={styles.discardLabel}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, isSaving && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            disabled={isSaving}
            accessibilityLabel="Confirm and save waypoint changes"
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmLabel}>Confirm Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  const color = STATUS_COLOR[entry.status];
  return (
    <View
      style={styles.diffRow}
      accessible
      accessibilityLabel={`Step ${entry.index + 1}: ${entry.label}, ${entry.status}`}
    >
      <Text style={[styles.diffIndex, { color }]}>{entry.index + 1}</Text>
      <Text style={[styles.diffLabel, { color }]} numberOfLines={1}>
        {entry.label}
      </Text>
      {entry.status !== 'unchanged' && (
        <Text style={[styles.diffStatus, { color }]}>
          {entry.status === 'modified' ? '~' : entry.status === 'added' ? '+' : '-'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f0f1acc',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 20,
    maxHeight: '85%',
    gap: 12,
  },
  title: { color: '#e8e8f0', fontSize: 18, fontWeight: '700' },
  summary: { color: '#9090cc', fontSize: 13 },
  columns: {
    flexDirection: 'row',
    flex: 1,
    gap: 0,
  },
  column: { flex: 1 },
  columnHeader: {
    color: '#9090cc',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  columnList: { maxHeight: 300 },
  divider: {
    width: 1,
    backgroundColor: '#2a2a3e',
    marginHorizontal: 8,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  diffIndex: { fontSize: 11, fontWeight: '700', width: 20, textAlign: 'right' },
  diffLabel: { fontSize: 12, flex: 1 },
  diffStatus: { fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  discardLabel: { color: '#9090cc', fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
