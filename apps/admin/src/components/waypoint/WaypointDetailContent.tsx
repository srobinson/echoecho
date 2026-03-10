/**
 * WaypointDetailContent — ALP-967 content rendered into MapDetailPanel.
 *
 * Shows waypoint metadata when a POI annotation is tapped on the map.
 * Rendered via the `detailContent` slot in MapDetailPanel.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Waypoint, WaypointType } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  waypoint: Waypoint;
}

const TYPE_EMOJI: Record<WaypointType, string> = {
  start: '🟢',
  end: '🔴',
  turn: '↪️',
  decision_point: '⚡',
  landmark: '🏛️',
  hazard: '⚠️',
  door: '🚪',
  elevator: '🛗',
  stairs: '🪜',
  ramp: '📐',
  crossing: '🦯',
  regular: '⬤',
};

const TYPE_LABEL: Record<WaypointType, string> = {
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
  regular: 'Regular',
};

export function WaypointDetailContent({ waypoint }: Props) {
  const accent = useSectionColor();
  const emoji = TYPE_EMOJI[waypoint.type] ?? '⬤';
  const typeLabel = TYPE_LABEL[waypoint.type] ?? waypoint.type;

  return (
    <View style={styles.container}>
      <View style={styles.typeRow}>
        <Text style={styles.typeEmoji} accessibilityElementsHidden>
          {emoji}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
          <Text style={styles.typeText}>{typeLabel}</Text>
        </View>
        <Text
          style={styles.seqBadge}
          accessibilityLabel={`Step ${waypoint.sequenceIndex + 1}`}
        >
          #{waypoint.sequenceIndex + 1}
        </Text>
      </View>

      {waypoint.audioLabel != null && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Prompt</Text>
          <Text style={styles.metaValue}>{waypoint.audioLabel}</Text>
        </View>
      )}

      {waypoint.description != null && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Notes</Text>
          <Text style={styles.metaValue} numberOfLines={3}>
            {waypoint.description}
          </Text>
        </View>
      )}

      {waypoint.headingOut != null && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Heading</Text>
          <Text
            style={styles.metaValue}
            accessibilityLabel={`Heading out ${waypoint.headingOut} degrees`}
          >
            {waypoint.headingOut}°
          </Text>
        </View>
      )}

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Coords</Text>
        <Text style={styles.coordValue}>
          {waypoint.coordinate.latitude.toFixed(6)},{' '}
          {waypoint.coordinate.longitude.toFixed(6)}
        </Text>
      </View>

      <View style={styles.attachmentRow}>
        <AttachmentBadge
          icon="mic"
          label="Audio"
          active={waypoint.audioAnnotationUrl != null}
        />
        <AttachmentBadge
          icon="camera"
          label="Photo"
          active={waypoint.photoUrl != null}
        />
      </View>
    </View>
  );
}

function AttachmentBadge({
  icon,
  label,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
}) {
  const accent = useSectionColor();
  return (
    <View
      style={[styles.attachment, active && { backgroundColor: accent + '11', borderColor: accent + '44' }]}
      accessible
      accessibilityLabel={`${label} ${active ? 'attached' : 'not attached'}`}
    >
      <Ionicons name={icon} size={14} color={active ? accent : '#1A5F7A'} />
      <Text style={[styles.attachmentLabel, active && { color: accent }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  typeEmoji: { fontSize: 20 },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  typeText: { color: '#a0a0ff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  seqBadge: { color: '#808090', fontSize: 13, fontWeight: '600', marginLeft: 'auto' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
  },
  metaLabel: { color: '#808090', fontSize: 12, width: 52, paddingTop: 1 },
  metaValue: { color: '#F0F0F5', fontSize: 13, fontWeight: '500', flex: 1 },
  coordValue: { color: '#606070', fontSize: 12, fontFamily: 'monospace', flex: 1 },
  attachmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D0D12',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  attachmentLabel: { color: '#1A5F7A', fontSize: 12, fontWeight: '600' },
});
