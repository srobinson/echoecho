/**
 * Student app root layout.
 *
 * Provider hierarchy (outermost to innermost):
 *   GestureHandlerRootView — required by react-native-gesture-handler
 *   CampusProvider         — pre-loads campus data for offline emergency routing (ALP-962)
 *   EmergencyOverlay       — triple-tap listener present on every screen (ALP-962)
 *   Stack                  — Expo Router navigation
 *
 * First-launch permission onboarding redirects before the home screen mounts.
 * This prevents hooks on the index screen (e.g. useSttDestination) from
 * triggering permission dialogs before the onboarding flow handles them.
 *
 * Persistent dark mode: screen brightness affects low-vision outdoor orientation.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CampusProvider } from '../src/context/CampusContext';
import { EmergencyOverlay } from '../src/components/EmergencyOverlay';
import { ensureAnonymousSession } from '../src/lib/supabase';
import { ONBOARDING_COMPLETE_KEY } from './onboarding';

// Shared context so onboarding can tell the layout it is complete,
// clearing the redirect before navigating to the home screen.
const OnboardingContext = createContext<{ completeOnboarding: () => void }>({
  completeOnboarding: () => {},
});

export function useOnboardingComplete() {
  return useContext(OnboardingContext).completeOnboarding;
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    Promise.all([
      ensureAnonymousSession().catch(() => ({ ok: false })),
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
    ]).then(([authResult, onboardingDone]) => {
      if ('ok' in authResult && !authResult.ok) {
        console.error('[auth] Could not establish session. Offline data only.');
      }
      setNeedsOnboarding(onboardingDone !== 'true');
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <OnboardingContext.Provider value={{ completeOnboarding }}>
        <CampusProvider>
          <EmergencyOverlay>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: '#060608' },
                headerTintColor: '#F5F5FA',
                headerTitleStyle: { fontWeight: '700', fontSize: 20 },
                contentStyle: { backgroundColor: '#060608' },
                headerBackButtonDisplayMode: 'minimal',
              }}
            >
              <Stack.Screen
                name="index"
                options={{ headerShown: false }}
                redirect={needsOnboarding}
              />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
                redirect={!needsOnboarding}
              />
              <Stack.Screen name="navigate" options={{ title: 'Navigation', headerShown: false }} />
              <Stack.Screen
                name="favorites"
                options={{ title: 'Favorites & History', headerBackTitle: 'Home' }}
              />
              <Stack.Screen
                name="emergency"
                options={{
                  title: 'Emergency',
                  presentation: 'fullScreenModal',
                  headerStyle: { backgroundColor: '#1A080E' },
                  headerTintColor: '#FF4081',
                }}
              />
            </Stack>
          </EmergencyOverlay>
        </CampusProvider>
      </OnboardingContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
