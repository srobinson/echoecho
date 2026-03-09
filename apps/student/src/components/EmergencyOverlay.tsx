/**
 * EmergencyOverlay — persistent triple-tap trigger mounted at root level.
 *
 * ALP-962 spec:
 *   - Mounted above the Stack navigator so it is present on every screen
 *   - Triple-tap via react-native-gesture-handler TapGestureHandler
 *   - iOS: triple-tap only (volume buttons reserved by iOS system)
 *   - Android: triple-tap only (react-native-volume-manager not yet integrated;
 *     volume-down enhancement tracked as future work)
 *   - On activation: AccessibilityInfo.announceForAccessibility fires immediately,
 *     before any computation or navigation
 *   - Navigation to emergency modal is deferred by one frame so the announce
 *     fires first
 *
 * Accessibility:
 *   When a screen reader is active, the TapGestureHandler is bypassed entirely
 *   to avoid conflict with VoiceOver rotor gestures on iOS 16+. Instead, a
 *   dedicated accessible button with accessibilityActions provides the trigger.
 *   When no screen reader is active, the gesture handler operates normally.
 *
 * Visual: minimal flash overlay on activation. The overlay is fullscreen
 * (behind pointerEvents="none"). Color uses emergency token (#FF5252).
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  AccessibilityInfo,
  Pressable,
  Platform,
} from 'react-native';
import { TapGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';

interface EmergencyOverlayProps {
  children: React.ReactNode;
}

export function EmergencyOverlay({ children }: EmergencyOverlayProps) {
  const tripleTapRef = useRef<TapGestureHandler>(null);
  const flashOpacity = useSharedValue(0);
  const [screenReaderActive, setScreenReaderActive] = useState(false);

  useEffect(() => {
    const check = async () => {
      const active = await AccessibilityInfo.isScreenReaderEnabled();
      setScreenReaderActive(active);
    };
    check();

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReaderActive,
    );
    return () => subscription.remove();
  }, []);

  const activateEmergency = useCallback(() => {
    AccessibilityInfo.announceForAccessibility(
      'Emergency mode activated. Finding nearest exit.',
    );

    flashOpacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 300 }),
    );

    requestAnimationFrame(() => {
      router.push('/emergency');
    });
  }, [flashOpacity]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const flashOverlay = (
    <Animated.View
      style={[styles.flash, flashStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );

  // When a screen reader is active, skip the TapGestureHandler entirely.
  // Provide a dedicated accessible button positioned at the bottom of the
  // screen that VoiceOver/TalkBack can discover and activate normally.
  if (screenReaderActive) {
    return (
      <View style={styles.root}>
        {children}
        <Pressable
          style={styles.srButton}
          onPress={activateEmergency}
          accessibilityLabel="Emergency. Double-tap to activate emergency navigation."
          accessibilityRole="button"
          accessibilityHint="Activates emergency navigation to nearest exit"
        />
        {flashOverlay}
      </View>
    );
  }

  return (
    <TapGestureHandler
      ref={tripleTapRef}
      numberOfTaps={3}
      onActivated={activateEmergency}
      shouldCancelWhenOutside={false}
    >
      <View style={styles.root}>
        {children}
        {flashOverlay}
      </View>
    </TapGestureHandler>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF5252',
    pointerEvents: 'none',
  },
  srButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 24,
    right: 16,
    width: 44,
    height: 44,
  },
});
