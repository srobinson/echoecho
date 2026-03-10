/**
 * WaypointEditSheet — bottom sheet for editing a single waypoint's
 * annotation text, type, and description.
 *
 * Opened when a waypoint marker is tapped during edit mode.
 * Fields: annotation text, waypoint type selector, description.
 * Delete action with confirmation.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Waypoint, WaypointType } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  waypoint: Waypoint | null;
  index: number | null;
  onUpdate: (index: number, fields: Partial<Pick<Waypoint, 'audioLabel' | 'description' | 'type'>>) => void;
  onDelete: (index: number) => void;
  onClose: () => void;
}

const TYPES: { value: WaypointType; label: string; emoji: string }[] = [
  { value: 'start', label: 'Start', emoji: '🟢' },
  { value: 'end', label: 'End', emoji: '🔴' },
  { value: 'turn', label: 'Turn', emoji: '↪️' },
  { value: 'decision_point', label: 'Decision', emoji: '⚡' },
  { value: 'landmark', label: 'Landmark', emoji: '🏛️' },
  { value: 'hazard', label: 'Hazard', emoji: '⚠️' },
  { value: 'door', label: 'Door', emoji: '🚪' },
  { value: 'elevator', label: 'Elevator', emoji: '🛗' },
  { value: 'stairs', label: 'Stairs', emoji: '🪜' },
  { value: 'ramp', label: 'Ramp', emoji: '📐' },
  { value: 'crossing', label: 'Crossing', emoji: '🦯' },
  { value: 'regular', label: 'Regular', emoji: '⬤' },
];

export function WaypointEditSheet({ waypoint, index, onUpdate, onDelete, onClose }: Props) {
  const accent = useSectionColor();
  const [syncedWaypoint, setSyncedWaypoint] = useState(waypoint);
  const [audioLabel, setAudioLabel] = useState(waypoint?.audioLabel ?? '');
  const [description, setDescription] = useState(waypoint?.description ?? '');
  const [type, setType] = useState<WaypointType>(waypoint?.type ?? 'regular');

  if (waypoint !== syncedWaypoint) {
    setSyncedWaypoint(waypoint);
    setAudioLabel(waypoint?.audioLabel ?? '');
    setDescription(waypoint?.description ?? '');
    setType(waypoint?.type ?? 'regular');
  }

  if (!waypoint || index === null) return null;

  function handleSave() {
    onUpdate(index!, {
      audioLabel: audioLabel.trim() || null,
      description: description.trim() || null,
      type,
    });
    onClose();
  }

  function handleDelete() {
    Alert.alert(
      `Delete waypoint #${index! + 1}?`,
      'This waypoint will be removed from the route.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(index!);
            onClose();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  return (
    <View style={styles.overlay}>
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Waypoint #{index + 1}
          </Text>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close waypoint editor"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color="#808090" />
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Audio Label</Text>
        <TextInput
          style={styles.input}
          value={audioLabel}
          onChangeText={setAudioLabel}
          placeholder="Short prompt read aloud to student"
          placeholderTextColor="#404050"
          accessibilityLabel="Audio label for this waypoint"
        />

        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              style={[styles.typeChip, type === t.value && { backgroundColor: accent + '22', borderColor: accent }]}
              onPress={() => setType(t.value)}
              accessibilityLabel={`Type: ${t.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === t.value }}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text style={[styles.typeLabel, type === t.value && { color: accent }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Detailed guidance notes"
          placeholderTextColor="#404050"
          multiline
          accessibilityLabel="Waypoint description"
        />

        <View style={styles.coords}>
          <Text style={styles.coordLabel}>
            {waypoint.coordinate.latitude.toFixed(6)}, {waypoint.coordinate.longitude.toFixed(6)}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.deleteBtn}
            onPress={handleDelete}
            accessibilityLabel={`Delete waypoint ${index + 1}`}
            accessibilityRole="button"
          >
            <Ionicons name="trash" size={16} color="#F06292" />
            <Text style={styles.deleteBtnLabel}>Delete</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: accent }]}
            onPress={handleSave}
            accessibilityLabel="Save waypoint changes"
            accessibilityRole="button"
          >
            <Text style={styles.saveBtnLabel}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
  },
  sheet: {
    backgroundColor: '#111116',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#1E1E26',
  },
  content: {
    padding: 20,
    gap: 10,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#F0F0F5', fontSize: 18, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: '#808090',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
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
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0D0D12',
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  typeEmoji: { fontSize: 14 },
  typeLabel: { color: '#606070', fontSize: 11, fontWeight: '600' },
  coords: {
    backgroundColor: '#0D0D12',
    borderRadius: 8,
    padding: 10,
  },
  coordLabel: {
    color: '#606070',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F0629222',
    borderWidth: 1,
    borderColor: '#F0629244',
    minHeight: 44,
  },
  deleteBtnLabel: { color: '#F06292', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
