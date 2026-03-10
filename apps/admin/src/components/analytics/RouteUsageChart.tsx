import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { BarChart } from '@echoecho/ui';
import type { RouteUsageStat } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  data: RouteUsageStat[];
}

export function RouteUsageChart({ data }: Props) {
  const accent = useSectionColor();
  const { width } = useWindowDimensions();
  const chartWidth = width - 64;

  if (data.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Route Usage</Text>
        <Text style={styles.emptyText}>No navigation data available yet.</Text>
      </View>
    );
  }

  const chartData = data.map((d, i) => ({
    x: i,
    y: d.navigationCount,
    label: d.name,
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Route Usage</Text>
      <Text style={styles.subtitle}>Top {data.length} routes by navigation count</Text>

      <View accessible={false} style={styles.chartContainer}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={200}
          color={accent}
          barRadius={4}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.routeId}
        style={styles.srTable}
        accessibilityRole="list"
        accessibilityLabel="Route usage data table"
        renderItem={({ item }) => (
          <Text
            style={styles.srRow}
            accessibilityLabel={`${item.name}: ${item.navigationCount} navigations`}
          >
            {item.name}: {item.navigationCount}
          </Text>
        )}
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
  chartContainer: { height: 200, alignSelf: 'center' },
  srTable: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  srRow: { color: '#F0F0F5', fontSize: 1 },
});
