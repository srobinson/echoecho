/**
 * Student app root layout.
 *
 * Accessibility-first: large text, high contrast, VoiceOver/TalkBack optimized.
 * The student app runs in a persistent dark mode — screen brightness affects
 * orientation for VI users.
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a14' },
          headerTintColor: '#f0f0ff',
          headerTitleStyle: { fontWeight: '700', fontSize: 20 },
          contentStyle: { backgroundColor: '#0a0a14' },
          // Larger touch targets for accessibility
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
          options={{ title: 'Favorites', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="emergency"
          options={{
            title: 'Emergency',
            presentation: 'fullScreenModal',
            headerStyle: { backgroundColor: '#7f1d1d' },
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
