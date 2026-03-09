/**
 * Layer toggle panel for the admin map view.
 * Allows O&M specialists to progressively reveal data overlays.
 */
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MapLayers {
  buildings: boolean;
  routes: boolean;
  waypoints: boolean;
}

interface Props {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
}

interface LayerToggleProps {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onToggle: () => void;
}

function LayerToggle({ label, icon, active, onToggle }: LayerToggleProps) {
  return (
    <Pressable
      style={[styles.toggle, active && styles.toggleActive]}
      onPress={onToggle}
      accessibilityLabel={`${label} layer ${active ? 'on' : 'off'}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? '#6c63ff' : '#8888aa'}
      />
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MapLayerControl({ layers, onChange }: Props) {
  function toggle(key: keyof MapLayers) {
    onChange({ ...layers, [key]: !layers[key] });
  }

  return (
    <View style={styles.container}>
      <LayerToggle
        label="Buildings"
        icon="business-outline"
        active={layers.buildings}
        onToggle={() => toggle('buildings')}
      />
      <LayerToggle
        label="Routes"
        icon="navigate-outline"
        active={layers.routes}
        onToggle={() => toggle('routes')}
      />
      <LayerToggle
        label="Waypoints"
        icon="location-outline"
        active={layers.waypoints}
        onToggle={() => toggle('waypoints')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2ecc',
    borderRadius: 12,
    padding: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: '#6c63ff22',
  },
  toggleLabel: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: '#6c63ff',
  },
});
