/**
 * WaypointReorderList — accessible list view for reordering waypoints.
 *
 * Shows waypoints in sequence with up/down buttons. Mandatory accessible
 * alternative to drag reorder on the map. Screen reader users can
 * reorder using these controls.
 */

import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Waypoint } from '@echoecho/shared';

interface Props {
  waypoints: Waypoint[];
  onMove: (fromIndex: number, direction: 'up' | 'down') => void;
  onClose: () => void;
}

export function WaypointReorderList({ waypoints, onMove, onClose }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Reorder Waypoints
          </Text>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close reorder list"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color="#9090cc" />
          </Pressable>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {waypoints.map((w, i) => (
            <View key={w.id} style={styles.row}>
              <View style={styles.indexBadge}>
                <Text style={styles.indexText}>{i + 1}</Text>
              </View>

              <View style={styles.info}>
                <Text style={styles.label} numberOfLines={1}>
                  {w.audioLabel ?? w.type}
                </Text>
                <Text style={styles.coord}>
                  {w.coordinate.latitude.toFixed(4)}, {w.coordinate.longitude.toFixed(4)}
                </Text>
              </View>

              <View style={styles.buttons}>
                <Pressable
                  style={[styles.moveBtn, i === 0 && styles.moveBtnDisabled]}
                  onPress={() => onMove(i, 'up')}
                  disabled={i === 0}
                  accessibilityLabel={`Move waypoint ${i + 1} up`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: i === 0 }}
                >
                  <Ionicons
                    name="chevron-up"
                    size={18}
                    color={i === 0 ? '#333355' : '#e8e8f0'}
                  />
                </Pressable>
                <Pressable
                  style={[styles.moveBtn, i === waypoints.length - 1 && styles.moveBtnDisabled]}
                  onPress={() => onMove(i, 'down')}
                  disabled={i === waypoints.length - 1}
                  accessibilityLabel={`Move waypoint ${i + 1} down`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: i === waypoints.length - 1 }}
                >
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={i === waypoints.length - 1 ? '#333355' : '#e8e8f0'}
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
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
  sheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
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
  list: { flex: 1 },
  listContent: { padding: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f3a',
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6c63ff22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: '#6c63ff', fontSize: 12, fontWeight: '700' },
  info: { flex: 1, gap: 2 },
  label: { color: '#e8e8f0', fontSize: 13, fontWeight: '500' },
  coord: { color: '#8888aa', fontSize: 10, fontFamily: 'monospace' },
  buttons: { flexDirection: 'row', gap: 4 },
  moveBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#14142a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  moveBtnDisabled: { opacity: 0.3 },
});
