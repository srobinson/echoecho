/**
 * Student home screen — destination selection via voice or touch.
 *
 * Accessibility design principles applied here:
 *   - All interactive elements have accessibilityLabel + accessibilityRole
 *   - Minimum 48pt touch targets
 *   - High-contrast color palette (WCAG AA)
 *   - VoiceOver announcements via AccessibilityInfo.announceForAccessibility
 *
 * ALP-954: Voice destination input wired here (mobile-engineer)
 * ALP-962: Emergency mode FAB
 * ALP-964: Favorites list
 */
import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigationStore } from '../src/stores/navigationStore';

export default function HomeScreen() {
  const { savedDestinations } = useNavigationStore();

  const handleVoiceSearch = useCallback(() => {
    // ALP-954: STT voice input — mobile-engineer implementation hook point
    AccessibilityInfo.announceForAccessibility('Voice search opened. Speak your destination.');
  }, []);

  const handleDestinationSelect = useCallback(
    (routeId: string, label: string) => {
      AccessibilityInfo.announceForAccessibility(`Starting navigation to ${label}`);
      router.push(`/navigate/${routeId}`);
    },
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName} accessibilityRole="header">
          EchoEcho
        </Text>
        <Text style={styles.tagline}>Where do you want to go?</Text>
      </View>

      {/* Voice search button — primary CTA */}
      <Pressable
        style={({ pressed }) => [styles.voiceBtn, pressed && styles.voiceBtnPressed]}
        onPress={handleVoiceSearch}
        accessibilityLabel="Search destination by voice"
        accessibilityRole="button"
        accessibilityHint="Double tap to start speaking your destination"
      >
        <Ionicons name="mic" size={40} color="#0a0a14" />
        <Text style={styles.voiceBtnLabel}>Speak Destination</Text>
      </Pressable>

      {/* Favorites / recent destinations */}
      <View style={styles.favoritesSection}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Favorites
        </Text>
        <FlatList
          data={savedDestinations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.favList}
          ListEmptyComponent={<FavoritesEmpty />}
          renderItem={({ item }) => (
            <DestinationCard
              label={item.label}
              onPress={() => handleDestinationSelect(item.routeId, item.label)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>

      {/* Emergency FAB — ALP-962 */}
      <Pressable
        style={({ pressed }) => [styles.emergencyBtn, pressed && styles.emergencyBtnPressed]}
        onPress={() => router.push('/emergency')}
        accessibilityLabel="Emergency — get immediate help"
        accessibilityRole="button"
        accessibilityHint="Double tap to activate emergency mode and alert your contacts"
      >
        <Ionicons name="alert-circle" size={24} color="#fff" />
        <Text style={styles.emergencyLabel}>Emergency</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function DestinationCard({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.destCard, pressed && styles.destCardPressed]}
      onPress={onPress}
      accessibilityLabel={`Navigate to ${label}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to start navigation"
    >
      <Ionicons name="navigate" size={22} color="#6c63ff" />
      <Text style={styles.destLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#6666aa" />
    </Pressable>
  );
}

function FavoritesEmpty() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>
        No favorites yet. Your recent routes will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  appName: {
    color: '#f0f0ff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  tagline: {
    color: '#9090cc',
    fontSize: 18,
    fontWeight: '400',
  },
  voiceBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 36,
    // Minimum 48pt requirement — this is 24+24+icon = well above
    minHeight: 100,
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  voiceBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  voiceBtnLabel: {
    color: '#0a0a14',
    fontSize: 22,
    fontWeight: '800',
  },
  favoritesSection: {
    flex: 1,
  },
  sectionTitle: {
    color: '#9090cc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  favList: {
    paddingBottom: 80,
  },
  separator: { height: 8 },
  destCard: {
    backgroundColor: '#14142a',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    minHeight: 60,
  },
  destCardPressed: { opacity: 0.75 },
  destLabel: {
    color: '#e0e0f8',
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyText: {
    color: '#5555aa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emergencyBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 20,
    right: 20,
    backgroundColor: '#9b1c1c',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 8,
    shadowColor: '#9b1c1c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    minHeight: 52,
  },
  emergencyBtnPressed: { opacity: 0.85 },
  emergencyLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
