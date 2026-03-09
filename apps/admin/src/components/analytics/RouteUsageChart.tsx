import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { CartesianChart, Bar } from '@echoecho/ui';
import type { RouteUsageStat } from '@echoecho/shared';

interface Props {
  data: RouteUsageStat[];
}

/**
 * Top 10 routes by navigation count. Bar chart with accessible data table.
 */
export function RouteUsageChart({ data }: Props) {
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

      <View accessible={false} style={[styles.chartContainer, { width: chartWidth }]}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['y']}
          domainPadding={{ left: 12, right: 12 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              color="#6c63ff"
              roundedCorners={{ topLeft: 4, topRight: 4 }}
            />
          )}
        </CartesianChart>
      </View>

      {/* Screen reader accessible data table */}
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 16,
    gap: 8,
  },
  title: { color: '#e8e8f0', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#8888aa', fontSize: 12 },
  emptyText: { color: '#5555aa', fontSize: 13, paddingVertical: 16 },
  chartContainer: { height: 200, alignSelf: 'center' },
  srTable: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  srRow: { color: '#e8e8f0', fontSize: 1 },
});
