import { View, Text, StyleSheet } from 'react-native';
import type { CampusCoverage } from '@echoecho/shared';

interface Props {
  data: CampusCoverage;
}

export function CoverageCard({ data }: Props) {
  const percent = data.totalPairs > 0
    ? Math.round((data.publishedPairs / data.totalPairs) * 100)
    : 0;

  const barColor = percent >= 75 ? '#22C55E' : percent >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Campus coverage: ${percent}%, ${data.publishedPairs} of ${data.totalPairs} building pairs have published routes`}
    >
      <Text style={styles.title}>Campus Coverage</Text>
      <Text style={styles.subtitle}>
        Building-to-building pairs with published routes
      </Text>

      <View style={styles.metricRow}>
        <Text style={styles.percentText}>{percent}%</Text>
        <Text style={styles.pairsText}>
          {data.publishedPairs} / {data.totalPairs} pairs
        </Text>
      </View>

      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(percent, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 16,
    gap: 8,
  },
  title: { color: '#e8e8f0', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#8888aa', fontSize: 12 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 4,
  },
  percentText: { color: '#e8e8f0', fontSize: 36, fontWeight: '800' },
  pairsText: { color: '#8888aa', fontSize: 14 },
  barTrack: {
    height: 8,
    backgroundColor: '#22223a',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: { height: 8, borderRadius: 4 },
});
