/**
 * EntrancePrompt — floating panel during entrance marking phase.
 *
 * Guides the user to tap near building edges to add entrances.
 * Shows a list of added entrances and a done button.
 */

import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Entrance } from '@echoecho/shared';
import { useSectionColor } from '../../contexts/SectionColorContext';

interface Props {
  buildingName: string;
  entrances: Entrance[];
  onTapEntrance: (name: string, isMain: boolean) => void;
  onDone: () => void;
  /** The latest tapped coordinate on the map, set by parent */
  pendingCoordinate: [number, number] | null;
  onConfirmEntrance: (name: string, isMain: boolean) => void;
  onCancelEntrance: () => void;
}

export function EntrancePrompt({
  buildingName,
  entrances,
  onDone,
  pendingCoordinate,
  onConfirmEntrance,
  onCancelEntrance,
}: Props) {
  const accent = useSectionColor();
  const [entranceName, setEntranceName] = useState('');
  const [isMain, setIsMain] = useState(entrances.length === 0);

  const handleConfirm = useCallback(() => {
    const name = entranceName.trim() || `Entrance ${entrances.length + 1}`;
    onConfirmEntrance(name, isMain);
    setEntranceName('');
    setIsMain(false);
  }, [entranceName, isMain, entrances.length, onConfirmEntrance]);

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Mark Entrances
      </Text>
      <Text style={styles.subtitle}>
        Tap on the edge of {buildingName} to add entrance points.
      </Text>

      {pendingCoordinate && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={entranceName}
            onChangeText={setEntranceName}
            placeholder={`Entrance ${entrances.length + 1}`}
            placeholderTextColor="#404050"
            accessibilityLabel="Entrance name"
          />
          <Pressable
            style={[styles.mainToggle, isMain && styles.mainToggleActive]}
            onPress={() => setIsMain(!isMain)}
            accessibilityRole="switch"
            accessibilityState={{ checked: isMain }}
            accessibilityLabel="Main entrance"
          >
            <Ionicons
              name={isMain ? 'star' : 'star-outline'}
              size={16}
              color={isMain ? '#81C784' : '#606070'}
            />
            <Text style={[styles.mainToggleLabel, isMain && styles.mainToggleLabelActive]}>
              Main
            </Text>
          </Pressable>
          <View style={styles.formActions}>
            <Pressable
              style={styles.cancelFormBtn}
              onPress={onCancelEntrance}
              accessibilityLabel="Cancel this entrance"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={18} color="#808090" />
            </Pressable>
            <Pressable
              style={styles.confirmFormBtn}
              onPress={handleConfirm}
              accessibilityLabel="Confirm entrance"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.confirmLabel}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      {entrances.length > 0 && (
        <View style={styles.list}>
          {entrances.map((e) => (
            <View key={e.id} style={styles.entranceRow}>
              <Ionicons
                name={e.isMain ? 'star' : 'location'}
                size={14}
                color={e.isMain ? '#81C784' : '#FFA726'}
              />
              <Text style={styles.entranceName}>{e.name}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        style={[styles.doneBtn, { backgroundColor: accent }]}
        onPress={onDone}
        accessibilityLabel={`Done marking entrances for ${buildingName}`}
        accessibilityRole="button"
      >
        <Text style={styles.doneLabel}>
          {entrances.length === 0 ? 'Skip Entrances' : 'Done'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111116ee',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    margin: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  title: {
    color: '#F0F0F5',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#808090',
    fontSize: 13,
  },
  form: {
    backgroundColor: '#0D0D12',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  input: {
    backgroundColor: '#0A0A0F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E1E26',
    color: '#F0F0F5',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  mainToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 36,
  },
  mainToggleActive: {
    backgroundColor: '#81C78422',
  },
  mainToggleLabel: {
    color: '#606070',
    fontSize: 13,
    fontWeight: '600',
  },
  mainToggleLabelActive: {
    color: '#81C784',
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelFormBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmFormBtn: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#81C784',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 6,
  },
  entranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  entranceName: {
    color: '#c8c8e8',
    fontSize: 13,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  doneLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
