/**
 * Student app root layout.
 *
 * Provider hierarchy (outermost to innermost):
 *   GestureHandlerRootView — required by react-native-gesture-handler
 *   CampusProvider         — pre-loads campus data for offline emergency routing (ALP-962)
 *   EmergencyOverlay       — triple-tap listener present on every screen (ALP-962)
 *   Stack                  — Expo Router navigation
 *
 * Persistent dark mode: screen brightness affects low-vision outdoor orientation.
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import { CampusProvider } from '../src/context/CampusContext';
import { EmergencyOverlay } from '../src/components/EmergencyOverlay';
import { ensureAnonymousSession } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    ensureAnonymousSession()
      .then(({ ok }) => {
        if (!ok) console.error('[auth] Could not establish session. Offline data only.');
        setAuthReady(true);
      })
      .catch(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (authReady) {
      SplashScreen.hideAsync();
    }
  }, [authReady]);

  if (!authReady) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <CampusProvider>
        <EmergencyOverlay>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0a0a14' },
              headerTintColor: '#f0f0ff',
              headerTitleStyle: { fontWeight: '700', fontSize: 20 },
              contentStyle: { backgroundColor: '#0a0a14' },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="navigate/[routeId]"
              options={{ title: 'Navigation', headerShown: false }}
            />
            <Stack.Screen
              name="favorites"
              options={{ title: 'Favorites & History', headerBackTitle: 'Home' }}
            />
            <Stack.Screen
              name="emergency"
              options={{
                title: 'Emergency',
                presentation: 'fullScreenModal',
                headerStyle: { backgroundColor: '#1A0000' },
                headerTintColor: '#FF5252',
              }}
            />
          </Stack>
        </EmergencyOverlay>
      </CampusProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
