/**
 * First-launch permission onboarding for visually impaired users.
 *
 * Single welcome screen, then system permission dialogs fire sequentially
 * (location, then microphone). TalkBack/VoiceOver handle the system dialogs
 * natively. No intermediate custom screens needed since VI users already
 * know how to interact with system permission prompts via their screen reader.
 *
 * If both permissions are denied and the OS will not re-prompt, a single
 * "Open Settings" screen appears with spoken instructions. The app re-checks
 * permissions when returning from Settings and auto-completes onboarding
 * once location is granted.
 *
 * Persists completion to AsyncStorage so it runs only once.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
  Linking,
  AppState,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useOnboardingComplete } from './_layout';
import { useCampus } from '../src/context/CampusContext';

export const ONBOARDING_COMPLETE_KEY = 'echoecho-onboarding-complete';

type Step = 'welcome' | 'requesting' | 'denied';

export default function OnboardingScreen() {
  const completeOnboarding = useOnboardingComplete();
  const { refresh: refreshCampus } = useCampus();
  const [step, setStep] = useState<Step>('welcome');

  // Speak the welcome message on mount.
  useEffect(() => {
    if (step !== 'welcome') return;
    const timer = setTimeout(() => {
      Speech.stop();
      const msg =
        'Welcome to EchoEcho. This app guides you through campus using voice directions. ' +
        'Tap the Get Started button at the bottom of your screen to allow permissions.';
      Speech.speak(msg);
      AccessibilityInfo.announceForAccessibility(msg);
    }, 500);
    return () => clearTimeout(timer);
  }, [step]);

  // Speak instructions when landing on the denied/Settings screen.
  useEffect(() => {
    if (step !== 'denied') return;
    const timer = setTimeout(() => {
      Speech.stop();
      const msg =
        'Location permission is required but was not granted. ' +
        'To enable it, tap the Open Settings button at the bottom of your screen, ' +
        'find EchoEcho, and turn on Location. ' +
        'When you return, the app will detect the change automatically.';
      Speech.speak(msg);
      AccessibilityInfo.announceForAccessibility(msg);
    }, 500);
    return () => clearTimeout(timer);
  }, [step]);

  const finish = useCallback(async () => {
    Speech.stop();
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    completeOnboarding();
    router.replace('/');
  }, [completeOnboarding]);

  // Re-check permissions when returning from Settings.
  useEffect(() => {
    if (step !== 'denied') return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        Speech.stop();
        Speech.speak('Location access granted. Welcome to EchoEcho.');
        AccessibilityInfo.announceForAccessibility('Location access granted.');
        void finish();
      }
    });
    return () => sub.remove();
  }, [step, finish]);

  const requestPermissions = useCallback(async () => {
    setStep('requesting');

    // Request location (system dialog).
    const locationResult = await Location.requestForegroundPermissionsAsync();
    console.log('[Onboarding] Location result:', {
      status: locationResult.status,
      canAskAgain: locationResult.canAskAgain,
    });

    if (locationResult.status !== 'granted' && !locationResult.canAskAgain) {
      // OS will not re-prompt. Direct to Settings.
      setStep('denied');
      return;
    }

    if (locationResult.status !== 'granted') {
      // Denied but can ask again. On Android, the user may have tapped
      // "Deny" without "Don't ask again." Show the denied screen so they
      // can either retry via Settings or relaunch the app.
      setStep('denied');
      return;
    }

    // Location granted. Kick off campus detection in the background so
    // the home screen has data by the time it mounts. CampusProvider's
    // initial fetch ran before location was granted, so it returned null.
    void refreshCampus();

    // Now request microphone (system dialog).
    Speech.stop();
    Speech.speak('Location granted. One more: microphone access for voice input.');
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const micResult = await Audio.requestPermissionsAsync();
    console.log('[Onboarding] Mic result:', {
      status: micResult.status,
      canAskAgain: micResult.canAskAgain,
    });

    // Microphone is optional. Whether granted or denied, onboarding is complete
    // as long as location is granted.
    if (micResult.status === 'granted') {
      Speech.stop();
      Speech.speak('All permissions granted. Welcome to EchoEcho.');
    } else {
      Speech.stop();
      Speech.speak(
        'Microphone was not granted. You can type destinations instead, ' +
          'or enable microphone later in Settings.',
      );
    }

    void finish();
  }, [finish, refreshCampus]);

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome to EchoEcho
          </Text>
          <Text style={styles.body}>
            EchoEcho guides you through campus using voice directions and audio cues.
          </Text>
          <Text style={styles.body}>
            Tap Get Started to allow location and microphone access. The system will ask you to
            confirm each permission.
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={requestPermissions}
            accessibilityLabel="Get started"
            accessibilityHint="Requests location and microphone permissions"
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'requesting') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            Setting Up
          </Text>
          <Text style={styles.body}>Requesting permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // denied
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Location Required
        </Text>
        <Text style={styles.body}>
          EchoEcho needs location access to navigate campus. Without it, the app cannot function.
        </Text>
        <Text style={styles.body}>
          Open Settings, find EchoEcho, and turn on Location. When you return, the app will continue
          automatically.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={() => void Linking.openSettings()}
          accessibilityLabel="Open device settings"
          accessibilityHint="Opens Settings where you can enable location for EchoEcho"
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Open Settings</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060608',
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#F5F5FA',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  body: {
    color: '#B0B0C0',
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 12,
  },
  actions: {
    paddingBottom: 32,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#4FC3F7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#060608',
    fontSize: 18,
    fontWeight: '700',
  },
});
