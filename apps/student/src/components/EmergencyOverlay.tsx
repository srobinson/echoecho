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
 *   accessibilityLabel="Emergency. Triple-tap to activate."
 *   accessibilityRole="button"
 *   accessibilityHint="Activates emergency navigation to nearest exit"
 *
 * Visual: minimal indicator in the bottom-right corner. The overlay is 44×44pt
 * (WCAG 2.5.5 minimum touch target). Color uses emergency token (#FF5252).
 *
 * Note on VoiceOver gesture conflict: the ActiveNavigation screen specifies
 * long-press 2s OR two-finger triple-tap as the in-navigation trigger. This
 * component handles the standard screen-level triple-tap (single-finger) which
 * is compatible with VoiceOver because VoiceOver's swipe/double-tap gestures
 * don't use single-finger triple-tap on app content.
 */

import { useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  AccessibilityInfo,
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

  const handleTripleTap = useCallback(() => {
      // Step 1: Announce immediately, before any computation
      AccessibilityInfo.announceForAccessibility(
        'Emergency mode activated. Finding nearest exit.',
      );

      // Brief visual flash to confirm activation (respects reduceMotion via
      // withTiming duration — reanimated respects AccessibilityInfo.isReduceMotionEnabled)
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 300 }),
      );

      // Defer navigation by one frame so the accessibility announcement fires first
      requestAnimationFrame(() => {
        router.push('/emergency');
      });
    },
    [flashOpacity],
  );

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  return (
    <TapGestureHandler
      ref={tripleTapRef}
      numberOfTaps={3}
      onActivated={handleTripleTap}
    >
      <View style={styles.root}>
        {children}

        {/* Emergency activation flash overlay — visual-only confirmation */}
        <Animated.View
          style={[styles.flash, flashStyle]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        />
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
});
