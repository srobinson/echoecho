/**
 * RouteDetailContent — ALP-968 content rendered into MapDetailPanel.
 *
 * Shows route summary and primary actions when a route polyline is tapped.
 * Rendered via the `detailContent` slot in MapDetailPanel.
 *
 * For full route management (edit, version history), navigates to
 * RouteDetailScreen at /route/[id].
 */

import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Route } from '@echoecho/shared';

interface Props {
  route: Route;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#F59E0B',
  published: '#22C55E',
  retracted: '#9CA3AF',
  pending_save: '#9CA3AF',
};

export function RouteDetailContent({ route, onClose }: Props) {
  const handleViewDetail = useCallback(() => {
    onClose();
    router.push(`/route/${route.id}`);
  }, [route.id, onClose]);

  const statusColor = STATUS_COLOR[route.status] ?? '#9CA3AF';

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <Stat
          icon="location-outline"
          value={`${route.waypoints.length}`}
          label="waypoints"
        />
        {route.distanceMeters != null && (
          <Stat
            icon="arrow-forward-outline"
            value={`${(route.distanceMeters / 1000).toFixed(2)} km`}
            label="distance"
          />
        )}
        {route.recordedDurationSec != null && (
          <Stat
            icon="time-outline"
            value={`${Math.round(route.recordedDurationSec / 60)} min`}
            label="walk time"
          />
        )}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Status</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {route.status}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>From</Text>
        <Text style={styles.metaValue} numberOfLines={1}>{route.fromLabel}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>To</Text>
        <Text style={styles.metaValue} numberOfLines={1}>{route.toLabel}</Text>
      </View>

      {route.hazards.length > 0 && (
        <View style={styles.hazardBadge}>
          <Ionicons name="warning" size={14} color="#F59E0B" />
          <Text style={styles.hazardText}>{route.hazards.length} active hazard{route.hazards.length !== 1 ? 's' : ''}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
        onPress={handleViewDetail}
        accessibilityLabel={`View full details for ${route.name}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to open route management screen"
      >
        <Text style={styles.viewBtnLabel}>View & Edit Route</Text>
        <Ionicons name="chevron-forward" size={16} color="#6c63ff" />
      </Pressable>
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={16} color="#8888aa" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#14142a',
    borderRadius: 10,
    paddingVertical: 10,
  },
  statValue: { color: '#e8e8f0', fontSize: 15, fontWeight: '700' },
  statLabel: { color: '#8888aa', fontSize: 10, textTransform: 'uppercase' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  metaLabel: { color: '#9090cc', fontSize: 13, width: 52 },
  metaValue: { color: '#e8e8f0', fontSize: 13, fontWeight: '500', flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  hazardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F59E0B22',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hazardText: { color: '#F59E0B', fontSize: 13, fontWeight: '600' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6c63ff22',
    borderWidth: 1,
    borderColor: '#6c63ff44',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 4,
    minHeight: 44,
  },
  viewBtnPressed: { opacity: 0.75 },
  viewBtnLabel: { color: '#6c63ff', fontSize: 15, fontWeight: '600' },
});
