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
            <Ionicons name="close" size={20} color="#9090cc" />
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Audio Label</Text>
        <TextInput
          style={styles.input}
          value={audioLabel}
          onChangeText={setAudioLabel}
          placeholder="Short prompt read aloud to student"
          placeholderTextColor="#5555aa"
          accessibilityLabel="Audio label for this waypoint"
        />

        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              style={[styles.typeChip, type === t.value && styles.typeChipActive]}
              onPress={() => setType(t.value)}
              accessibilityLabel={`Type: ${t.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === t.value }}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>
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
          placeholderTextColor="#5555aa"
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
            <Ionicons name="trash" size={16} color="#ef4444" />
            <Text style={styles.deleteBtnLabel}>Delete</Text>
          </Pressable>
          <Pressable
            style={styles.saveBtn}
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
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2a2a3e',
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
  title: { color: '#e8e8f0', fontSize: 18, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: '#9090cc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
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
    backgroundColor: '#14142a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  typeChipActive: {
    backgroundColor: '#6c63ff22',
    borderColor: '#6c63ff',
  },
  typeEmoji: { fontSize: 14 },
  typeLabel: { color: '#8888aa', fontSize: 11, fontWeight: '600' },
  typeLabelActive: { color: '#6c63ff' },
  coords: {
    backgroundColor: '#14142a',
    borderRadius: 8,
    padding: 10,
  },
  coordLabel: {
    color: '#8888aa',
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
    backgroundColor: '#ef444422',
    borderWidth: 1,
    borderColor: '#ef444444',
    minHeight: 44,
  },
  deleteBtnLabel: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
