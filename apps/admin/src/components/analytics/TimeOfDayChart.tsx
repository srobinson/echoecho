import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { CartesianChart, Line } from '@echoecho/ui';
import type { TimeOfDayStat } from '@echoecho/shared';

interface Props {
  data: TimeOfDayStat[];
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/**
 * Navigation frequency by hour (0-23). Line chart with accessible data table.
 */
export function TimeOfDayChart({ data }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 64;

  if (data.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Navigation by Time of Day</Text>
        <Text style={styles.emptyText}>No time-of-day data available yet.</Text>
      </View>
    );
  }

  const chartData = data.map((d) => ({
    x: d.hour,
    y: d.count,
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Navigation by Time of Day</Text>
      <Text style={styles.subtitle}>Aggregated across all routes</Text>

      <View accessible={false} style={[styles.chartContainer, { width: chartWidth }]}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['y']}
          domainPadding={{ left: 8, right: 8 }}
        >
          {({ points }) => (
            <Line
              points={points.y}
              color="#38bdf8"
              strokeWidth={2}
              curveType="natural"
            />
          )}
        </CartesianChart>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.hour)}
        style={styles.srTable}
        accessibilityRole="list"
        accessibilityLabel="Navigation by time of day data table"
        renderItem={({ item }) => (
          <Text
            style={styles.srRow}
            accessibilityLabel={`${formatHour(item.hour)}: ${item.count} navigations`}
          >
            {formatHour(item.hour)}: {item.count}
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
