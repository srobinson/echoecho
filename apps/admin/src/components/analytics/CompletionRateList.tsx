import { View, Text, FlatList, StyleSheet } from 'react-native';
import type { CompletionRateRow } from '@echoecho/shared';

interface Props {
  data: CompletionRateRow[];
}

function completionColor(percent: number): string {
  if (percent >= 80) return '#81C784';
  if (percent >= 50) return '#FFB74D';
  return '#F06292';
}

export function CompletionRateList({ data }: Props) {
  if (data.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Completion Rates</Text>
        <Text style={styles.emptyText}>No completion data available yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Completion Rates</Text>
      <Text style={styles.subtitle}>Per-route navigation completion</Text>

      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.nameCol]}>Route</Text>
        <Text style={[styles.headerCell, styles.numCol]}>Total</Text>
        <Text style={[styles.headerCell, styles.numCol]}>Done</Text>
        <Text style={[styles.headerCell, styles.numCol]}>Rate</Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.routeId}
        scrollEnabled={false}
        accessibilityRole="list"
        accessibilityLabel="Route completion rates"
        renderItem={({ item }) => {
          const color = completionColor(item.completionPercent);
          return (
            <View
              style={styles.row}
              accessibilityLabel={`${item.name}: ${item.totalNavigations} navigations, ${item.completions} completed, ${item.completionPercent}% rate`}
            >
              <Text style={[styles.cell, styles.nameCol]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.cell, styles.numCol]}>{item.totalNavigations}</Text>
              <Text style={[styles.cell, styles.numCol]}>{item.completions}</Text>
              <View style={[styles.rateBadge, { backgroundColor: `${color}22` }]}>
                <Text style={[styles.rateText, { color }]}>
                  {item.completionPercent}%
                </Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  emptyText: { color: '#404050', fontSize: 13, paddingVertical: 16 },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
  },
  headerCell: {
    color: '#404050',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameCol: { flex: 1 },
  numCol: { width: 52, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  cell: { color: '#C0C0C8', fontSize: 13 },
  separator: { height: 1, backgroundColor: '#1e1e38' },
  rateBadge: {
    width: 52,
    borderRadius: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  rateText: { fontSize: 12, fontWeight: '700' },
});
