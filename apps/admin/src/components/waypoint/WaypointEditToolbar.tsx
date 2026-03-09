/**
 * WaypointEditToolbar — floating toolbar during waypoint edit mode.
 *
 * Shows save, reorder, and cancel actions.
 */

import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  waypointCount: number;
  hasChanges: boolean;
  onSave: () => void;
  onReorder: () => void;
  onCancel: () => void;
}

export function WaypointEditToolbar({
  waypointCount,
  hasChanges,
  onSave,
  onReorder,
  onCancel,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Editing {waypointCount} waypoints
        {hasChanges ? ' (modified)' : ''}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.btnPressed]}
          onPress={onCancel}
          accessibilityLabel="Cancel waypoint editing"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={18} color="#ef4444" />
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.reorderBtn, pressed && styles.btnPressed]}
          onPress={onReorder}
          accessibilityLabel="Open reorder list"
          accessibilityRole="button"
        >
          <Ionicons name="swap-vertical" size={18} color="#e8e8f0" />
          <Text style={styles.reorderLabel}>Reorder</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            styles.saveBtn,
            !hasChanges && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={onSave}
          disabled={!hasChanges}
          accessibilityLabel="Save waypoint changes"
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasChanges }}
        >
          <Ionicons name="checkmark" size={18} color={hasChanges ? '#fff' : '#555577'} />
          <Text style={[styles.saveLabel, !hasChanges && styles.saveLabelDisabled]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2eee',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  hint: {
    color: '#9090cc',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
  },
  btnPressed: { opacity: 0.75 },
  btnDisabled: { opacity: 0.4 },
  cancelBtn: {
    backgroundColor: '#ef444422',
    borderWidth: 1,
    borderColor: '#ef444444',
  },
  cancelLabel: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  reorderBtn: {
    backgroundColor: '#14142a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  reorderLabel: { color: '#e8e8f0', fontSize: 13, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#22C55E',
  },
  saveLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  saveLabelDisabled: { color: '#555577' },
});
