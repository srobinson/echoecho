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
import { useCallback, useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useSttDestination } from '../src/hooks/useSttDestination';
import { loadBuildingIndex, fuzzySearch } from '../src/lib/buildingIndex';

// Show at most 5 favorites on the home screen; remainder accessible via "See all"
const HOME_FAVORITES_LIMIT = 5;

export default function HomeScreen() {
  const { userId } = useNavigationStore();
  const { favorites, isFavorite, toggleFavorite } = useRouteHistory(userId);
  const [showKeyboardFallback, setShowKeyboardFallback] = useState(false);
  const [keyboardQuery, setKeyboardQuery] = useState('');

  // Load building index on mount for STT fuzzy matching
  useEffect(() => {
    void loadBuildingIndex();
  }, []);

  const handleDestinationSelect = useCallback((routeId: string, label: string) => {
    AccessibilityInfo.announceForAccessibility(`Starting navigation to ${label}`);
    router.push(`/navigate/${routeId}`);
  }, []);

  const handleDestinationConfirmed = useCallback((buildingId: string, name: string) => {
    AccessibilityInfo.announceForAccessibility(`Starting navigation to ${name}`);
    router.push(`/navigate/${buildingId}`);
  }, []);

  const {
    sttState,
    matches,
    pendingMatch,
    error: sttError,
    sttUnavailable,
    startListening,
    stopListening,
    confirmDestination,
    rejectDestination,
    resetToIdle,
  } = useSttDestination(handleDestinationConfirmed);

  const handleVoiceSearch = useCallback(() => {
    if (sttUnavailable) {
      setShowKeyboardFallback(true);
      AccessibilityInfo.announceForAccessibility(
        'Voice search unavailable. Keyboard input opened.'
      );
      return;
    }
    void startListening();
  }, [sttUnavailable, startListening]);

  const handleKeyboardSearch = useCallback((query: string) => {
    const results = fuzzySearch(query);
    if (results.length === 0) {
      AccessibilityInfo.announceForAccessibility(`No destination found for ${query}.`);
      return;
    }
    const best = results[0];
    handleDestinationConfirmed(best.item.id, best.item.name);
    setShowKeyboardFallback(false);
    setKeyboardQuery('');
  }, [handleDestinationConfirmed]);

  useEffect(() => {
    if (sttState === 'transcribing') {
      AccessibilityInfo.announceForAccessibility('Processing your speech');
    }
  }, [sttState]);

  const topFavorites = favorites.slice(0, HOME_FAVORITES_LIMIT);

  const renderFavoriteItem = useCallback(
    ({ item }: { item: (typeof favorites)[number] }) => (
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
    ),
    [isFavorite, handleDestinationSelect, toggleFavorite],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.appName} accessibilityRole="header">
          EchoEcho
        </Text>
        <Text style={styles.tagline}>Where do you want to go?</Text>
      </View>

      {/* Voice input button with STT state feedback */}
      <Pressable
        style={({ pressed }) => [
          styles.voiceBtn,
          sttState === 'listening' && styles.voiceBtnListening,
          pressed && styles.voiceBtnPressed,
        ]}
        onPress={sttState === 'listening' ? stopListening : handleVoiceSearch}
        accessibilityLabel={
          sttState === 'listening'
            ? 'Listening. Tap to stop.'
            : sttState === 'transcribing'
              ? 'Processing your speech. Please wait.'
              : 'Start voice destination input'
        }
        accessibilityRole="button"
        accessibilityHint="Double tap to speak your destination"
        accessibilityState={{ busy: sttState === 'transcribing' }}
      >
        <Ionicons
          name={sttState === 'listening' ? 'mic' : 'mic-outline'}
          size={40}
          color={sttState === 'listening' ? '#fff' : '#060608'}
        />
        <Text
          style={[
            styles.voiceBtnLabel,
            sttState === 'listening' && styles.voiceBtnLabelListening,
          ]}
        >
          {sttState === 'listening'
            ? 'Listening...'
            : sttState === 'transcribing'
              ? 'Processing...'
              : 'Speak Destination'}
        </Text>
      </Pressable>

      {/* STT confirmation prompt */}
      {sttState === 'confirming' && pendingMatch && (
        <View style={styles.sttConfirmCard} accessibilityLiveRegion="polite">
          <Text style={styles.sttConfirmText}>
            Navigate to {pendingMatch.name}?
          </Text>
          <View style={styles.sttConfirmActions}>
            <Pressable
              style={({ pressed }) => [styles.sttConfirmBtn, pressed && { opacity: 0.7 }]}
              onPress={confirmDestination}
              accessibilityLabel={`Yes, navigate to ${pendingMatch.name}`}
              accessibilityRole="button"
            >
              <Text style={styles.sttConfirmBtnText}>Yes</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sttRejectBtn, pressed && { opacity: 0.7 }]}
              onPress={rejectDestination}
              accessibilityLabel="No, try again"
              accessibilityRole="button"
            >
              <Text style={styles.sttRejectBtnText}>No</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* STT disambiguation */}
      {sttState === 'disambiguating' && matches.length > 0 && (
        <View style={styles.sttConfirmCard} accessibilityLiveRegion="polite">
          <Text style={styles.sttConfirmText}>Did you mean:</Text>
          {matches.map((m) => (
            <Pressable
              key={m.buildingId}
              style={({ pressed }) => [styles.sttDisambigBtn, pressed && { opacity: 0.7 }]}
              onPress={() => handleDestinationConfirmed(m.buildingId, m.name)}
              accessibilityLabel={`Navigate to ${m.name}`}
              accessibilityRole="button"
            >
              <Ionicons name="navigate" size={18} color="#4FC3F7" />
              <Text style={styles.sttDisambigText}>{m.name}</Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [styles.sttRejectBtn, pressed && { opacity: 0.7 }]}
            onPress={resetToIdle}
            accessibilityLabel="Cancel and try again"
            accessibilityRole="button"
          >
            <Text style={styles.sttRejectBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* STT error state */}
      {sttState === 'error' && sttError && (
        <View style={styles.sttErrorCard} accessibilityLiveRegion="assertive">
          <Text style={styles.sttErrorText}>{sttError}</Text>
          <View style={styles.sttConfirmActions}>
            <Pressable
              style={({ pressed }) => [styles.sttConfirmBtn, pressed && { opacity: 0.7 }]}
              onPress={() => void startListening()}
              accessibilityLabel="Try voice search again"
              accessibilityRole="button"
            >
              <Text style={styles.sttConfirmBtnText}>Try again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sttRejectBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                resetToIdle();
                setShowKeyboardFallback(true);
              }}
              accessibilityLabel="Switch to keyboard input"
              accessibilityRole="button"
            >
              <Text style={styles.sttRejectBtnText}>Type instead</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Keyboard fallback */}
      {showKeyboardFallback && (
        <View style={styles.keyboardFallback}>
          <TextInput
            style={styles.keyboardInput}
            value={keyboardQuery}
            onChangeText={setKeyboardQuery}
            placeholder="Type destination name..."
            placeholderTextColor="#404050"
            autoFocus
            accessibilityLabel="Type your destination"
            returnKeyType="search"
            onSubmitEditing={() => {
              const q = keyboardQuery.trim();
              if (q) handleKeyboardSearch(q);
            }}
          />
          <Pressable
            style={({ pressed }) => [styles.sttRejectBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setShowKeyboardFallback(false);
              setKeyboardQuery('');
            }}
            accessibilityLabel="Close keyboard input"
            accessibilityRole="button"
          >
            <Text style={styles.sttRejectBtnText}>Cancel</Text>
          </Pressable>
        </View>
      )}

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
          renderItem={renderFavoriteItem}
          ItemSeparatorComponent={FavoriteSeparator}
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

function FavoriteSeparator() {
  return <View style={styles.separator} />;
}

const DestinationCard = memo(function DestinationCard({
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
        <Ionicons name="navigate" size={22} color="#4FC3F7" />
        <View style={styles.destTextBlock}>
          <Text style={styles.destLabel}>{label}</Text>
          <Text style={styles.destSublabel}>{sublabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#505060" />
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
          color={isFavorite ? '#FFD54F' : '#1A5F7A'}
        />
      </Pressable>
    </View>
  );
});

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
    backgroundColor: '#060608',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  appName: {
    color: '#F5F5FA',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  tagline: {
    color: '#808090',
    fontSize: 18,
    fontWeight: '400',
  },
  voiceBtn: {
    backgroundColor: '#4FC3F7',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 36,
    minHeight: 100,
    shadowColor: '#4FC3F7',
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
    color: '#060608',
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
    color: '#808090',
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
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '600',
  },
  favList: {
    paddingBottom: 80,
  },
  separator: { height: 8 },
  destCard: {
    backgroundColor: '#0D0D12',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22222C',
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
    color: '#E0E0E8',
    fontSize: 17,
    fontWeight: '600',
  },
  destSublabel: {
    color: '#505060',
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
    borderLeftColor: '#22222C',
  },
  favTogglePressed: { opacity: 0.7 },
  emptyState: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#0D0D12',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22222C',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: '#404050',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emergencyBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 20,
    right: 20,
    backgroundColor: '#4A1528',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 8,
    shadowColor: '#4A1528',
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
  voiceBtnListening: {
    backgroundColor: '#81C784',
    shadowColor: '#81C784',
  },
  voiceBtnLabelListening: {
    color: '#fff',
  },
  sttConfirmCard: {
    backgroundColor: '#0D0D12',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#22222C',
    gap: 16,
    marginBottom: 8,
  },
  sttConfirmText: {
    color: '#E0E0E8',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  sttConfirmActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  sttConfirmBtn: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sttConfirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sttRejectBtn: {
    backgroundColor: '#22222C',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sttRejectBtnText: {
    color: '#808090',
    fontSize: 16,
    fontWeight: '600',
  },
  sttDisambigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111116',
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
  },
  sttDisambigText: {
    color: '#E0E0E8',
    fontSize: 16,
    fontWeight: '600',
  },
  sttErrorCard: {
    backgroundColor: '#1A080E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#4A1528',
    gap: 12,
    marginBottom: 8,
  },
  sttErrorText: {
    color: '#F8BBD0',
    fontSize: 15,
    textAlign: 'center',
  },
  keyboardFallback: {
    backgroundColor: '#0D0D12',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22222C',
    gap: 12,
    marginBottom: 8,
  },
  keyboardInput: {
    backgroundColor: '#060608',
    borderRadius: 12,
    padding: 16,
    color: '#E0E0E8',
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#2A2A35',
    minHeight: 52,
  },
});
