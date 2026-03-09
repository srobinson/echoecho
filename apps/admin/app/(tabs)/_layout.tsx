import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCampusStore } from '../../src/stores/campusStore';
import { useAuthStore } from '../../src/stores/authStore';
import { CampusGateScreen } from '../../src/components/CampusGateScreen';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  focused,
}: {
  name: IoniconsName;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={24}
      color={focused ? '#6c63ff' : '#8888aa'}
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
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a3e',
        },
        tabBarActiveTintColor: '#6c63ff',
        tabBarInactiveTintColor: '#8888aa',
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#e8e8f0',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="map" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="navigate" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="buildings"
        options={{
          title: 'Buildings',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="business" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="hazards"
        options={{
          title: 'Hazards',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="warning" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="analytics" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon name="settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
