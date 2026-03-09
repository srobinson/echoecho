/**
 * BuildingDrawToolbar — floating toolbar shown during polygon draw mode.
 *
 * Provides undo, close polygon, coordinate input toggle, and cancel actions.
 * All controls meet 44pt minimum touch target.
 */

import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DrawPhase = 'drawing' | 'closed' | 'metadata' | 'entrances';

interface Props {
  phase: DrawPhase;
  vertexCount: number;
  onUndo: () => void;
  onClosePolygon: () => void;
  onCancel: () => void;
  onToggleCoordinateInput: () => void;
}

export function BuildingDrawToolbar({
  phase,
  vertexCount,
  onUndo,
  onClosePolygon,
  onCancel,
  onToggleCoordinateInput,
}: Props) {
  if (phase !== 'drawing') return null;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        {vertexCount === 0
          ? 'Tap map to place vertices'
          : `${vertexCount} vertices placed`}
      </Text>

      <View style={styles.actions}>
        <ToolbarButton
          icon="arrow-undo"
          label="Undo last vertex"
          onPress={onUndo}
          disabled={vertexCount === 0}
        />
        <ToolbarButton
          icon="checkmark-circle"
          label="Close polygon"
          onPress={onClosePolygon}
          disabled={vertexCount < 3}
          color="#22C55E"
        />
        <ToolbarButton
          icon="keypad"
          label="Enter coordinates manually"
          onPress={onToggleCoordinateInput}
        />
        <ToolbarButton
          icon="close-circle"
          label="Cancel drawing"
          onPress={onCancel}
          color="#ef4444"
        />
      </View>
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  disabled,
  color = '#e8e8f0',
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={disabled ? '#555577' : color}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2eee',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  hint: {
    color: '#9090cc',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#14142a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    backgroundColor: '#2a2a3e',
  },
});
