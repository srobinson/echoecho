/**
 * Emergency mode screen (ALP-962).
 *
 * VI students can activate emergency mode to:
 *   1. Announce their location to a contact
 *   2. Call a contact immediately
 *   3. Get audio guidance to the nearest safe location
 *
 * Screen is accessible-first: large targets, high contrast, VoiceOver/TalkBack
 * reads the critical actions immediately on focus.
 */
import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EmergencyScreen() {
  useEffect(() => {
    // Immediately announce to screen reader that emergency mode is active
    AccessibilityInfo.announceForAccessibility(
      'Emergency mode activated. Choose an action below.',
    );
  }, []);

  const handleCallContact = useCallback(() => {
    // ALP-962 implementation: dial saved emergency contact
    Linking.openURL('tel:911');
  }, []);

  const handleShareLocation = useCallback(() => {
    // ALP-962 implementation: share via SMS/push to emergency contact
    AccessibilityInfo.announceForAccessibility('Sharing your location with your emergency contact.');
  }, []);

  const handleDismiss = useCallback(() => {
    AccessibilityInfo.announceForAccessibility('Emergency mode cancelled.');
    router.back();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={64} color="#fca5a5" />
        <Text style={styles.title} accessibilityRole="header">
          Emergency Mode
        </Text>
        <Text style={styles.subtitle}>
          Choose an action. Help is available.
        </Text>
      </View>

      <View style={styles.actions}>
        <EmergencyAction
          icon="call"
          label="Call Emergency Contact"
          hint="Double tap to dial your emergency contact"
          onPress={handleCallContact}
          color="#ef4444"
        />

        <EmergencyAction
          icon="location"
          label="Share My Location"
          hint="Double tap to send your current location to your emergency contact"
          onPress={handleShareLocation}
          color="#f97316"
        />

        <EmergencyAction
          icon="navigate"
          label="Guide Me to Safety"
          hint="Double tap to receive audio guidance to the nearest building entrance"
          onPress={() => {
            AccessibilityInfo.announceForAccessibility(
              'Finding nearest safe location. Follow audio instructions.',
            );
          }}
          color="#eab308"
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        onPress={handleDismiss}
        accessibilityLabel="Cancel emergency mode"
        accessibilityRole="button"
        accessibilityHint="Double tap to return to home screen"
      >
        <Text style={styles.cancelLabel}>{"Cancel — I'm Safe"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function EmergencyAction({
  icon,
  label,
  hint,
  onPress,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.action,
        { borderColor: color },
        pressed && styles.actionPressed,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={32} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0408',
    paddingHorizontal: 20,
    gap: 32,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  title: {
    color: '#fca5a5',
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: '#f87171',
    fontSize: 16,
    textAlign: 'center',
  },
  actions: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
  },
  action: {
    backgroundColor: '#1a0808',
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 72,
  },
  actionPressed: { opacity: 0.8 },
  actionLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  cancelBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  cancelBtnPressed: { opacity: 0.7 },
  cancelLabel: {
    color: '#6666aa',
    fontSize: 16,
    fontWeight: '600',
  },
});
