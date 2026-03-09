/**
 * Student home screen — destination selection via voice or touch.
 *
 * Shows top favorites for quick access. "See all" links to the full
 * favorites + history screen (ALP-964). Emergency mode is accessible
 * from the persistent bottom-right button and via triple-tap on any
 * screen (ALP-962).
 *
 * ALP-954: Voice destination input hook point (mobile-engineer)
 * ALP-962: Emergency mode FAB + triple-tap overlay in _layout.tsx
 * ALP-964: Favorites via useRouteHistory
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
import { useRouteHistory } from '../src/hooks/useRouteHistory';

// Show at most 5 favorites on the home screen; remainder accessible via "See all"
const HOME_FAVORITES_LIMIT = 5;

export default function HomeScreen() {
  const { userId } = useNavigationStore();
  const { favorites, isFavorite, toggleFavorite } = useRouteHistory(userId);

  const handleVoiceSearch = useCallback(() => {
    // ALP-954: STT voice input — mobile-engineer implementation hook point
    AccessibilityInfo.announceForAccessibility('Voice search opened. Speak your destination.');
  }, []);

  const handleDestinationSelect = useCallback((routeId: string, label: string) => {
    AccessibilityInfo.announceForAccessibility(`Starting navigation to ${label}`);
    router.push(`/navigate/${routeId}`);
  }, []);

  const topFavorites = favorites.slice(0, HOME_FAVORITES_LIMIT);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.appName} accessibilityRole="header">
          EchoEcho
        </Text>
        <Text style={styles.tagline}>Where do you want to go?</Text>
      </View>

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

      <View style={styles.favoritesSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Favorites
          </Text>
          <Pressable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/favorites' as any)}
            style={styles.seeAllBtn}
            accessibilityLabel="See all favorites and history"
            accessibilityRole="button"
            accessibilityHint="Double tap to view all favorites and recent routes"
          >
            <Text style={styles.seeAllLabel}>See all</Text>
          </Pressable>
        </View>

        <FlatList
          data={topFavorites}
          keyExtractor={(item) => item.routeId}
          contentContainerStyle={styles.favList}
          ListEmptyComponent={<FavoritesEmpty />}
          renderItem={({ item }) => (
            <DestinationCard
              label={item.routeName}
              sublabel={`${item.fromLabel} → ${item.toLabel}`}
              isFavorite={isFavorite(item.routeId)}
              onPress={() => handleDestinationSelect(item.routeId, item.routeName)}
              onToggleFavorite={() => {
                void toggleFavorite({
                  id: item.routeId,
                  name: item.routeName,
                  fromLabel: item.fromLabel,
                  toLabel: item.toLabel,
                } as Parameters<typeof toggleFavorite>[0]);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          accessibilityRole="list"
          scrollEnabled={false}
        />
      </View>

      {/* Emergency FAB — direct tap; triple-tap is also available on any screen */}
      <Pressable
        style={({ pressed }) => [styles.emergencyBtn, pressed && styles.emergencyBtnPressed]}
        onPress={() => router.push('/emergency')}
        accessibilityLabel="Emergency. Triple-tap anywhere to activate."
        accessibilityRole="button"
        accessibilityHint="Activates emergency navigation to nearest exit"
      >
        <Ionicons name="alert-circle" size={24} color="#fff" />
        <Text style={styles.emergencyLabel}>Emergency</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function DestinationCard({
  label,
  sublabel,
  isFavorite,
  onPress,
  onToggleFavorite,
}: {
  label: string;
  sublabel: string;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <View style={styles.destCard}>
      <Pressable
        style={({ pressed }) => [styles.destMain, pressed && styles.destCardPressed]}
        onPress={onPress}
        accessibilityLabel={`Navigate to ${label}, ${sublabel}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to start navigation"
      >
        <Ionicons name="navigate" size={22} color="#6c63ff" />
        <View style={styles.destTextBlock}>
          <Text style={styles.destLabel}>{label}</Text>
          <Text style={styles.destSublabel}>{sublabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6666aa" />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.favToggle, pressed && styles.favTogglePressed]}
        onPress={onToggleFavorite}
        accessibilityLabel={isFavorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite }}
      >
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={20}
          color={isFavorite ? '#eab308' : '#4444aa'}
        />
      </Pressable>
    </View>
  );
}

function FavoritesEmpty() {
  return (
    <View
      style={styles.emptyState}
      accessible
      accessibilityLabel="No favorites yet. Navigate a route and tap the star to save it."
    >
      <Text style={styles.emptyText} accessibilityElementsHidden>
        No favorites yet.{'\n'}Navigate a route and tap ★ to save it.
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#9090cc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    flex: 1,
  },
  seeAllBtn: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  seeAllLabel: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '600',
  },
  favList: {
    paddingBottom: 80,
  },
  separator: { height: 8 },
  destCard: {
    backgroundColor: '#14142a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 64,
  },
  destMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 12,
    gap: 14,
  },
  destCardPressed: { opacity: 0.75 },
  destTextBlock: {
    flex: 1,
    gap: 2,
  },
  destLabel: {
    color: '#e0e0f8',
    fontSize: 17,
    fontWeight: '600',
  },
  destSublabel: {
    color: '#6666aa',
    fontSize: 13,
    fontWeight: '400',
  },
  favToggle: {
    width: 52,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a4e',
  },
  favTogglePressed: { opacity: 0.7 },
  emptyState: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#14142a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderStyle: 'dashed',
  },
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
