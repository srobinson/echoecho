import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthListener } from '../src/hooks/useAuth';
import { useProtectedRoute } from '../src/hooks/useProtectedRoute';
import { useAuthStore } from '../src/stores/authStore';
import { useCampusStore } from '../src/stores/campusStore';
import { supabase } from '../src/lib/supabase';
import type { Campus } from '@echoecho/shared';

// Import GPS recording service at root level to ensure the expo-task-manager
// background task is defined before any component renders (required by expo-task-manager).
import '../src/services/gpsRecordingService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);

  useAuthListener();
  useProtectedRoute();

  useEffect(() => {
    if (initialized) {
      SplashScreen.hideAsync();
    }
  }, [initialized]);

  // Load campuses after auth is established. Sets the first campus as active
  // so map layers and data queries have a campus_id to filter by.
  useEffect(() => {
    if (!session) return;

    supabase
      .from('campuses')
      .select('id, name, location, bounds, security_phone, created_at, updated_at')
      .is('deleted_at', null)
      .order('name')
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;

        const campuses = data.map((c: {
          id: string;
          name: string;
          location: { coordinates: [number, number] } | null;
          bounds: { coordinates: [number[][]] } | null;
          created_at: string;
          updated_at: string;
        }): Campus => {
          const coords = c.location?.coordinates;
          const center = coords
            ? { latitude: coords[1], longitude: coords[0] }
            : { latitude: 0, longitude: 0 };

          const ring = c.bounds?.coordinates?.[0] ?? [];
          const lats = ring.map((p: number[]) => p[1]);
          const lngs = ring.map((p: number[]) => p[0]);

          return {
            id: c.id,
            name: c.name,
            shortName: c.name,
            center,
            bounds: lats.length > 0
              ? {
                  northEast: { latitude: Math.max(...lats), longitude: Math.max(...lngs) },
                  southWest: { latitude: Math.min(...lats), longitude: Math.min(...lngs) },
                }
              : { northEast: center, southWest: center },
            defaultZoom: 16,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
          };
        });

        useCampusStore.getState().setCampuses(campuses);
        if (!useCampusStore.getState().activeCampus) {
          useCampusStore.getState().setActiveCampus(campuses[0]);
        }
      });
  }, [session]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#e8e8f0',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0f0f1a' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="campus/[id]"
          options={{ title: 'Campus', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="route/[id]"
          options={{ title: 'Route', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="record"
          options={{ title: 'Record Route', presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="haptic-lab"
          options={{ title: 'Haptic Lab', headerBackTitle: 'Settings' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
