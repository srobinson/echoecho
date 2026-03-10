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
import { useCallback, useState, useEffect, memo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  AccessibilityInfo,
  Platform,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

import { useNavigationStore } from '../src/stores/navigationStore';
import { useRouteHistory } from '../src/hooks/useRouteHistory';
import { useSttDestination } from '../src/hooks/useSttDestination';
import { loadBuildingIndex, fuzzySearch } from '../src/lib/buildingIndex';
import { useCampus } from '../src/context/CampusContext';
import { getLocalRoutesForCampus, type LocalRoute } from '../src/lib/localDb';
import { supabase } from '../src/lib/supabase';
import { matchRoute, preloadRoute } from '../src/lib/routeMatchingService';
import type { Route } from '@echoecho/shared';

// Show at most 5 favorites on the home screen; remainder accessible via "See all"
const HOME_FAVORITES_LIMIT = 5;

interface AssistRoute {
  id: string;
  name: string;
  fromBuildingId: string | null;
  toBuildingId: string | null;
  fromLabel: string;
  toLabel: string;
}

export default function HomeScreen() {
  const { userId, setCurrentSession } = useNavigationStore();
  const { favorites, isFavorite, toggleFavorite } = useRouteHistory(userId);
  const { campus, isLoaded: campusLoaded, loadFailed } = useCampus();
  const [showKeyboardFallback, setShowKeyboardFallback] = useState(false);
  const [keyboardQuery, setKeyboardQuery] = useState('');
  const [showLocationPermissionHelp, setShowLocationPermissionHelp] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState<LocalRoute[]>([]);
  const [availableRouteSummaries, setAvailableRouteSummaries] = useState<AssistRoute[]>([]);
  const lastSpokenNoMatchRef = useRef<string | null>(null);

  // Load building index on mount for STT fuzzy matching
  useEffect(() => {
    void loadBuildingIndex();
  }, []);

  const startRouteNavigation = useCallback(async (
    routeId: string,
    routeName: string,
    fromLabel = '',
    toLabel = '',
  ) => {
    await preloadRoute(routeId);

    const { data } = await supabase
      .from('v_routes' as 'routes')
      .select('*')
      .eq('id', routeId)
      .single();

    if (data) {
      setCurrentSession({
        id: `session-${Date.now()}`,
        userId: userId ?? 'anonymous',
        route: data as Route,
        status: 'searching',
        positioningMode: 'unknown',
        currentPosition: null,
        currentWaypointIndex: 0,
        distanceToNextWaypoint: null,
        bearingToNextWaypoint: null,
        startedAt: new Date().toISOString(),
        arrivedAt: null,
      });
    }

    AccessibilityInfo.announceForAccessibility(`Starting navigation to ${toLabel || routeName}`);
    router.push(`/navigate/${routeId}`);
  }, [setCurrentSession, userId]);

  const resolveRouteForDestination = useCallback(async (buildingId: string, name: string) => {
    if (!campus?.id) {
      throw new Error('Campus not ready');
    }

    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== 'granted') {
      setShowLocationPermissionHelp(true);
      throw new Error('Location permission required. Enable location access in Settings.');
    }

    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const current = lastKnown ?? await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const matched = await matchRoute({
      lat: current.coords.latitude,
      lng: current.coords.longitude,
      destinationText: name,
      campusId: campus.id,
      limit: 5,
    });

    if ('error' in matched) {
      throw new Error(matched.error.message);
    }

    const bestRoute = matched.data.matches.find((route) => route.endBuildingId === buildingId)
      ?? matched.data.matches[0];

    if (!bestRoute) {
      throw new Error(`No published route found for ${name}`);
    }

    await startRouteNavigation(
      bestRoute.routeId,
      bestRoute.routeName,
      bestRoute.startBuildingName,
      bestRoute.endBuildingName,
    );
  }, [campus?.id, startRouteNavigation]);

  const handleDestinationSelect = useCallback((routeId: string, label: string) => {
    void startRouteNavigation(routeId, label);
  }, [startRouteNavigation]);

  const handleDestinationConfirmed = useCallback((buildingId: string, name: string) => {
    void resolveRouteForDestination(buildingId, name).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not start navigation.';
      Speech.stop();
      Speech.speak(message);
      AccessibilityInfo.announceForAccessibility(message);
    });
  }, [resolveRouteForDestination]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const {
    sttState,
    transcript,
    matches,
    pendingMatch,
    error: sttError,
    sttUnavailable,
    startListening,
    stopListening,
    resetToIdle,
  } = useSttDestination(handleDestinationConfirmed);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableRoutes() {
      if (!campus?.id) {
        setAvailableRoutes([]);
        setAvailableRouteSummaries([]);
        return;
      }

      const [localRoutes, routeHeaders, buildingRows] = await Promise.all([
        getLocalRoutesForCampus(campus.id),
        supabase
          .from('v_routes' as 'routes')
          .select('id, name, fromBuildingId, toBuildingId, fromLabel, toLabel')
          .eq('campusId' as 'campus_id', campus.id)
          .eq('status', 'published')
          .order('name'),
        supabase
          .from('v_buildings' as 'buildings')
          .select('id, name')
          .eq('campusId' as 'campus_id', campus.id),
      ]);

      if (!cancelled) {
        setAvailableRoutes(localRoutes);
        if (routeHeaders.error || !routeHeaders.data) {
          setAvailableRouteSummaries([]);
          return;
        }

        const buildingNameById = new Map<string, string>(
          ((buildingRows.error || !buildingRows.data ? [] : buildingRows.data) as Array<{
            id: string;
            name: string;
          }>).map((building) => [building.id, building.name]),
        );

        setAvailableRouteSummaries((routeHeaders.data as AssistRoute[]).map((route) => ({
          ...route,
          fromLabel: route.fromLabel?.trim() || (route.fromBuildingId ? buildingNameById.get(route.fromBuildingId) ?? 'Unknown start' : 'Unknown start'),
          toLabel: route.toLabel?.trim() || (route.toBuildingId ? buildingNameById.get(route.toBuildingId) ?? 'Unknown destination' : 'Unknown destination'),
        })));
      }
    }

    void loadAvailableRoutes();
    return () => {
      cancelled = true;
    };
  }, [campus?.id]);

  // Pulsing animation while listening
  const [pulseAnim] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (sttState === 'listening') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [sttState, pulseAnim]);

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

  useEffect(() => {
    if (sttState !== 'error' || !sttError || !transcript) {
      lastSpokenNoMatchRef.current = null;
      return;
    }

    if (!sttError.startsWith('No destination found')) {
      return;
    }

    if (lastSpokenNoMatchRef.current === transcript) {
      return;
    }

    const routeSummary = availableRouteSummaries.length > 0
      ? `Available routes on ${campus?.name ?? 'this campus'} include ${availableRouteSummaries
        .slice(0, 4)
        .map((route) => `${route.name} from ${route.fromLabel} to ${route.toLabel}`)
        .join(', ')}.`
      : 'There are no synced routes available right now.';

    Speech.stop();
    Speech.speak(`I could not find ${transcript}. ${routeSummary} Review the route list below or try again.`);
    lastSpokenNoMatchRef.current = transcript;
  }, [sttState, sttError, transcript, availableRouteSummaries, campus?.name]);

  const speakAvailableRoutes = useCallback(() => {
    const routeSummary = availableRouteSummaries.length > 0
      ? `${availableRouteSummaries.length} available route${availableRouteSummaries.length === 1 ? '' : 's'}: ${availableRouteSummaries
        .slice(0, 6)
        .map((route) => `${route.name} from ${route.fromLabel} to ${route.toLabel}`)
        .join(', ')}.`
      : 'There are no synced routes available on this device right now.';
    Speech.stop();
    Speech.speak(routeSummary);
    AccessibilityInfo.announceForAccessibility(routeSummary);
  }, [availableRouteSummaries]);

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
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
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
      </Animated.View>

      <View style={styles.assistCard} accessibilityLiveRegion="polite">
        <View style={styles.assistRow}>
          <Text style={styles.assistLabel}>Campus</Text>
          <Text style={styles.assistValue}>
            {!campusLoaded
              ? 'Detecting...'
              : loadFailed
                ? 'Unavailable'
                : campus?.name ?? 'No campus detected'}
          </Text>
        </View>
        <View style={styles.assistRow}>
          <Text style={styles.assistLabel}>Routes on device</Text>
          <Text style={styles.assistValue}>{availableRoutes.length}</Text>
        </View>
        <View style={styles.assistRowStack}>
          <Text style={styles.assistLabel}>Heard</Text>
          <Text style={styles.assistTranscript}>
            {transcript?.trim() || 'Nothing yet'}
          </Text>
        </View>
        <View style={styles.assistRowStack}>
          <Text style={styles.assistLabel}>Available routes</Text>
          <Text style={styles.assistRouteList}>
            {availableRouteSummaries.length > 0
              ? availableRouteSummaries
                .slice(0, 6)
                .map((route) => `${route.name} (${route.fromLabel} → ${route.toLabel})`)
                .join(' • ')
              : 'No synced routes available yet'}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.assistSecondaryBtn, pressed && { opacity: 0.75 }]}
          onPress={speakAvailableRoutes}
          accessibilityLabel="Speak the available routes"
          accessibilityRole="button"
        >
          <Ionicons name="volume-high-outline" size={18} color="#4FC3F7" />
          <Text style={styles.assistSecondaryBtnText}>Speak available routes</Text>
        </Pressable>
      </View>

      {showLocationPermissionHelp && (
        <View style={styles.permissionCard} accessibilityLiveRegion="assertive">
          <Text style={styles.permissionTitle}>Location access needed</Text>
          <Text style={styles.permissionText}>
            EchoEcho needs your current location to choose the best route and start navigation.
          </Text>
          <View style={styles.permissionActions}>
            <Pressable
              style={({ pressed }) => [styles.sttConfirmBtn, pressed && { opacity: 0.7 }]}
              onPress={handleOpenSettings}
              accessibilityLabel="Open app settings"
              accessibilityRole="button"
            >
              <Text style={styles.sttConfirmBtnText}>Enable Location</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sttRejectBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowLocationPermissionHelp(false)}
              accessibilityLabel="Dismiss permission help"
              accessibilityRole="button"
            >
              <Text style={styles.sttRejectBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* STT confirmation prompt */}
      {sttState === 'confirming' && pendingMatch && (
        <View style={styles.sttConfirmCard} accessibilityLiveRegion="polite">
          <Text style={styles.sttConfirmText}>
            Matched destination: {pendingMatch.name}
          </Text>
          <Text style={styles.sttConfirmSubtext}>
            Starting navigation…
          </Text>
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
  assistCard: {
    backgroundColor: '#0D0D12',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#22222C',
    padding: 16,
    gap: 10,
    marginBottom: 24,
  },
  assistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  assistRowStack: {
    gap: 6,
  },
  assistLabel: {
    color: '#808090',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  assistValue: {
    color: '#F5F5FA',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  assistTranscript: {
    color: '#F5F5FA',
    fontSize: 18,
    fontWeight: '600',
  },
  assistRouteList: {
    color: '#B0B0BE',
    fontSize: 14,
    lineHeight: 20,
  },
  assistSecondaryBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#28465A',
    backgroundColor: '#101C24',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistSecondaryBtnText: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '700',
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
  sttConfirmSubtext: {
    color: '#A0A0AE',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  permissionCard: {
    backgroundColor: '#171117',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#4A2835',
    gap: 12,
    marginBottom: 8,
  },
  permissionTitle: {
    color: '#F5F5FA',
    fontSize: 18,
    fontWeight: '700',
  },
  permissionText: {
    color: '#C7C7D4',
    fontSize: 14,
    lineHeight: 20,
  },
  permissionActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
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
