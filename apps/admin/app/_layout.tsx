import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthListener } from '../src/hooks/useAuth';
import { useProtectedRoute } from '../src/hooks/useProtectedRoute';
import { useAuthStore } from '../src/stores/authStore';

import { initMapbox } from '../src/lib/mapbox';
import '../src/services/gpsRecordingService';

initMapbox();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialized = useAuthStore((s) => s.initialized);

  useAuthListener();
  useProtectedRoute();

  useEffect(() => {
    if (initialized) {
      SplashScreen.hideAsync();
    }
  }, [initialized]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111116' },
          headerTintColor: '#F0F0F5',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0A0A0F' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="campus/[id]"
          options={{ title: 'Campus', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="building/[id]"
          options={{ title: 'Building', headerBackTitle: 'Back' }}
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
