import { View, Text, FlatList, StyleSheet, type DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TopDestination } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  data: TopDestination[];
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export function TopDestinationsCard({ data }: Props) {
  const accent = useSectionColor();
  if (data.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Top Destinations</Text>
        <Text style={styles.emptyText}>No destination data available yet.</Text>
      </View>
    );
  }

  const maxCount = data[0]?.count ?? 1;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Top Destinations</Text>
      <Text style={styles.subtitle}>Most navigated-to buildings</Text>

      <FlatList
        data={data}
        keyExtractor={(item) => item.buildingId}
        scrollEnabled={false}
        accessibilityRole="list"
        accessibilityLabel="Top destinations by frequency"
        renderItem={({ item, index }) => {
          const barWidth = `${Math.max((item.count / maxCount) * 100, 8)}%` as DimensionValue;
          const medalColor = MEDAL_COLORS[index] ?? undefined;
          return (
            <View
              style={styles.row}
              accessibilityLabel={`Rank ${index + 1}: ${item.name}, ${item.count} navigations`}
            >
              <View style={styles.rankCol}>
                {medalColor ? (
                  <Ionicons name="trophy" size={16} color={medalColor} />
                ) : (
                  <Text style={styles.rankText}>{index + 1}</Text>
                )}
              </View>
              <View style={styles.nameCol}>
                <Text style={styles.nameText} numberOfLines={1}>{item.name}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: barWidth, backgroundColor: accent }]} />
                </View>
              </View>
              <Text style={styles.countText}>{item.count}</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  rankCol: { width: 28, alignItems: 'center' },
  rankText: { color: '#404050', fontSize: 14, fontWeight: '700' },
  nameCol: { flex: 1, gap: 4 },
  nameText: { color: '#C0C0C8', fontSize: 14 },
  barTrack: {
    height: 4,
    backgroundColor: '#18181F',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },
  countText: { color: '#606070', fontSize: 13, fontWeight: '600', width: 40, textAlign: 'right' },
  separator: { height: 1, backgroundColor: '#1e1e38' },
});
