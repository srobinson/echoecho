/**
 * BuildingEditPanel — ALP-966 content rendered into MapDetailPanel.
 *
 * Shows building metadata and entrance list. Provides edit and delete actions.
 * Rendered via the `detailContent` slot in MapDetailPanel when a building
 * feature is tapped on the map.
 *
 * ALP-966 spec:
 *   - Shows metadata: name, shortName, category, floor count
 *   - Entrance list with each entrance name and isMain indicator
 *   - Edit action: opens BuildingMetadataSheet
 *   - Delete action: confirmation dialog, focus returns to map after delete
 */

import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import type { Building } from '@echoecho/shared';
import { supabase } from '../../lib/supabase';
import { BuildingMetadataSheet } from './BuildingMetadataSheet';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  building: Building;
  onClose: () => void;
  onDeleted?: () => void;
}

export function BuildingEditPanel({ building, onClose, onDeleted }: Props) {
  const accent = useSectionColor();
  const [isDeleting, setIsDeleting] = useState(false);
  const [editBuilding, setEditBuilding] = useState<Building>(building);
  const metadataSheetRef = useRef<BottomSheet>(null);

  const handleDelete = useCallback(() => {
    Alert.alert(
      `Delete ${editBuilding.name}?`,
      'This will remove the building and all its entrances. This cannot be undone.',
      [
        {
          text: 'Delete Building',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            const { error } = await supabase
              .from('buildings')
              .delete()
              .eq('id', editBuilding.id);
            setIsDeleting(false);
            if (error) {
              Alert.alert('Delete failed', error.message);
              return;
            }
            AccessibilityInfo.announceForAccessibility(
              `${editBuilding.name} deleted.`,
            );
            onDeleted?.();
            onClose();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [editBuilding, onClose, onDeleted]);

  return (
    <View style={styles.container}>
      {/* Metadata section */}
      <View style={styles.section}>
        <Row label="Category" value={editBuilding.category} />
        {editBuilding.shortName ? (
          <Row label="Short name" value={editBuilding.shortName} />
        ) : null}
        {editBuilding.description ? (
          <Row label="Description" value={editBuilding.description} />
        ) : null}
      </View>

      {/* Entrances */}
      <SectionHeader title={`Entrances (${editBuilding.entrances.length})`} />
      {editBuilding.entrances.length === 0 ? (
        <Text style={styles.emptyText}>No entrances marked yet.</Text>
      ) : (
        editBuilding.entrances.map((entrance) => (
          <View key={entrance.id} style={styles.entranceRow}>
            <Ionicons
              name={entrance.isMain ? 'enter' : 'git-merge-outline'}
              size={16}
              color={entrance.isMain ? accent : '#606070'}
            />
            <View style={styles.entranceText}>
              <Text style={styles.entranceName}>{entrance.name}</Text>
              {entrance.isMain && (
                <Text style={[styles.mainBadge, { color: accent, backgroundColor: accent + '22' }]}>Main</Text>
              )}
            </View>
          </View>
        ))
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.editBtn, { backgroundColor: accent + '22', borderColor: accent + '44' }, pressed && styles.actionPressed]}
          onPress={() => metadataSheetRef.current?.snapToIndex(0)}
          accessibilityLabel={`Edit ${editBuilding.name}`}
          accessibilityRole="button"
        >
          <Ionicons name="pencil" size={16} color={accent} />
          <Text style={[styles.editBtnLabel, { color: accent }]}>Edit</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.deleteBtn,
            isDeleting && styles.actionDisabled,
            pressed && styles.actionPressed,
          ]}
          onPress={handleDelete}
          disabled={isDeleting}
          accessibilityLabel={`Delete building ${editBuilding.name}`}
          accessibilityRole="button"
          accessibilityHint="Double tap to permanently delete this building"
        >
          <Ionicons name="trash" size={16} color="#F06292" />
          <Text style={styles.deleteBtnLabel}>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      </View>

      <BuildingMetadataSheet
        sheetRef={metadataSheetRef}
        building={editBuilding}
        onSave={(updated: Building) => setEditBuilding(updated)}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader} accessibilityRole="header">
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  section: {
    backgroundColor: '#0D0D12',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowLabel: { color: '#808090', fontSize: 13, fontWeight: '500', flex: 1 },
  rowValue: { color: '#F0F0F5', fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
  sectionHeader: {
    color: '#808090',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  entranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
  },
  entranceText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  entranceName: { color: '#c8c8e8', fontSize: 14 },
  mainBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyText: { color: '#404050', fontSize: 13, fontStyle: 'italic' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  editBtn: {
    borderWidth: 1,
  },
  deleteBtn: {
    backgroundColor: '#F0629222',
    borderWidth: 1,
    borderColor: '#F0629244',
  },
  actionDisabled: { opacity: 0.5 },
  actionPressed: { opacity: 0.75 },
  editBtnLabel: { fontSize: 14, fontWeight: '600' },
  deleteBtnLabel: { color: '#F06292', fontSize: 14, fontWeight: '600' },
});
