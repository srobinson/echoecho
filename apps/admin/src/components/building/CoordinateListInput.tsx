/**
 * CoordinateListInput — accessible fallback for polygon entry.
 *
 * Users type lat,lng pairs one per line as an alternative to the
 * gesture-based map tap polygon drawing. Mandatory for screen reader
 * users and keyboard-only input.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';

interface Props {
  onSubmit: (vertices: [number, number][]) => void;
  onCancel: () => void;
}

export function CoordinateListInput({ onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 3) {
      Alert.alert('Minimum 3 points', 'A building polygon requires at least 3 coordinate pairs.');
      return;
    }

    const vertices: [number, number][] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,\s]+/).filter(Boolean);
      if (parts.length < 2) {
        Alert.alert('Invalid format', `Line ${i + 1}: expected "latitude, longitude" but got "${lines[i]}"`);
        return;
      }
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        Alert.alert('Invalid coordinates', `Line ${i + 1}: values out of range. Latitude: -90 to 90, Longitude: -180 to 180.`);
        return;
      }
      // Store as [lng, lat] for GeoJSON convention
      vertices.push([lng, lat]);
    }

    onSubmit(vertices);
  }, [text, onSubmit]);

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Enter Coordinates
      </Text>
      <Text style={styles.instructions}>
        Enter one coordinate per line as: latitude, longitude
      </Text>
      <Text style={styles.example}>
        Example: 30.3495, -97.7468
      </Text>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={'30.3495, -97.7468\n30.3498, -97.7470\n30.3496, -97.7472'}
        placeholderTextColor="#5555aa"
        multiline
        numberOfLines={8}
        textAlignVertical="top"
        accessibilityLabel="Coordinate pairs, one per line as latitude comma longitude"
        accessibilityHint="Enter at least 3 coordinate pairs to define a building polygon"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
      />

      <View style={styles.actions}>
        <Pressable
          style={styles.cancelBtn}
          onPress={onCancel}
          accessibilityLabel="Cancel coordinate entry"
          accessibilityRole="button"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
        <Pressable
          style={styles.submitBtn}
          onPress={handleSubmit}
          accessibilityLabel="Submit coordinates to create building polygon"
          accessibilityRole="button"
        >
          <Text style={styles.submitLabel}>Use Coordinates</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    margin: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  title: {
    color: '#e8e8f0',
    fontSize: 18,
    fontWeight: '700',
  },
  instructions: {
    color: '#9090cc',
    fontSize: 13,
  },
  example: {
    color: '#6c63ff',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#14142a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    color: '#e8e8f0',
    fontSize: 14,
    fontFamily: 'monospace',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 160,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelLabel: { color: '#9090cc', fontSize: 15, fontWeight: '600' },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  submitLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
