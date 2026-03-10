/**
 * Layer toggle panel for the admin map view.
 * Allows O&M specialists to progressively reveal data overlays.
 */
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSectionColor } from '../contexts/SectionColorContext';

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
  const accent = useSectionColor();
  return (
    <Pressable
      style={[styles.toggle, active && { backgroundColor: accent + '22' }]}
      onPress={onToggle}
      accessibilityLabel={`${label} layer ${active ? 'on' : 'off'}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? accent : '#606070'}
      />
      <Text style={[styles.toggleLabel, active && { color: accent }]}>
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
    backgroundColor: '#111116cc',
    borderRadius: 12,
    padding: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#1E1E26',
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
  toggleLabel: {
    color: '#606070',
    fontSize: 12,
    fontWeight: '600',
  },
});
