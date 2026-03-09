import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  accuracy: number | null;
  isDegraded: boolean;
}

function accuracyColor(accuracy: number | null): string {
  if (accuracy === null) return '#8888aa';
  if (accuracy < 5)  return '#48bb78';
  if (accuracy < 15) return '#ed8936';
  return '#e53e3e';
}

export function GpsAccuracyIndicator({ accuracy, isDegraded }: Props) {
  const color = isDegraded ? '#e53e3e' : accuracyColor(accuracy);
  const label =
    accuracy !== null
      ? `GPS accuracy: ${Math.round(accuracy)} meters`
      : 'GPS accuracy: unknown';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={label}
    >
      <Ionicons name="locate-outline" size={13} color={color} />
      <Text style={[styles.text, { color }]}>
        {accuracy !== null ? `${Math.round(accuracy)}m` : '--'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
