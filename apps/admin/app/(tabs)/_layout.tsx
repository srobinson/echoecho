import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCampusStore } from '../../src/stores/campusStore';
import { useAuthStore } from '../../src/stores/authStore';
import { CampusGateScreen } from '../../src/components/CampusGateScreen';
import { tabColors } from '@echoecho/ui';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  focused,
  color,
}: {
  name: IoniconsName;
  focused: boolean;
  color: string;
}) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={24}
      color={color}
    />
  );
}

export default function TabsLayout() {
  const activeCampus = useCampusStore((s) => s.activeCampus);
  const session = useAuthStore((s) => s.session);

  if (session && !activeCampus) {
    return <CampusGateScreen />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#111116',
          borderTopColor: '#1E1E26',
        },
        tabBarInactiveTintColor: '#606070',
        headerStyle: { backgroundColor: '#111116' },
        headerTintColor: '#F0F0F5',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarActiveTintColor: tabColors.map,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="map" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarActiveTintColor: tabColors.routes,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="navigate" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="buildings"
        options={{
          title: 'Buildings',
          tabBarActiveTintColor: tabColors.buildings,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="business" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hazards"
        options={{
          title: 'Hazards',
          tabBarActiveTintColor: tabColors.hazards,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="warning" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarActiveTintColor: tabColors.analytics,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="analytics" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarActiveTintColor: tabColors.settings,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="settings" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
