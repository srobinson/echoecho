import { View, Text, StyleSheet } from 'react-native';
import type { CampusCoverage } from '@echoecho/shared';

interface Props {
  data: CampusCoverage;
}

export function CoverageCard({ data }: Props) {
  const percent = data.totalPairs > 0
    ? Math.round((data.publishedPairs / data.totalPairs) * 100)
    : 0;

  const barColor = percent >= 75 ? '#81C784' : percent >= 40 ? '#FFB74D' : '#F06292';

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
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
    padding: 16,
    gap: 8,
  },
  title: { color: '#F0F0F5', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#606070', fontSize: 12 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 4,
  },
  percentText: { color: '#F0F0F5', fontSize: 36, fontWeight: '800' },
  pairsText: { color: '#606070', fontSize: 14 },
  barTrack: {
    height: 8,
    backgroundColor: '#18181F',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: { height: 8, borderRadius: 4 },
});
