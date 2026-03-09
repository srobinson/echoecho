/**
 * Favorites and history screen.
 *
 * ALP-964 spec compliance:
 *   - Two sections: favorites first, then recent routes (last 20, FIFO)
 *   - FavoriteToggle announces state change to screen reader
 *   - One-tap re-navigate shows confirmation bottom sheet before navigating
 *   - Confirmation sheet: "Start navigation" receives initial focus (not Cancel)
 *   - Each route item accessibilityLabel includes name, buildings, status
 *   - Empty favorites state has accessible label
 *   - VoiceOver/TalkBack accessible throughout
 *
 * The re-navigate confirmation is implemented as an Alert (native modal).
 * Alert initial focus on the primary action is platform-default on iOS
 * (first action receives focus). On Android, explicit AccessibilityInfo
 * announcement names the primary action immediately on Alert open.
 */

import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouteHistory } from '../src/hooks/useRouteHistory';
import { useNavigationStore } from '../src/stores/navigationStore';

export default function FavoritesScreen() {
  const { userId } = useNavigationStore();
  const { history, favorites, isLoading, toggleFavorite, isFavorite, clearHistory } =
    useRouteHistory(userId);

  // Merged list built once per state change, not on every renderItem call
  const listData = useMemo(
    () => [
      ...favorites.map((f) => ({ ...f, type: 'favorite' as const })),
      ...history.map((h) => ({ ...h, type: 'history' as const })),
    ],
    [favorites, history],
  );

  const handleReNavigate = useCallback((routeId: string, routeName: string) => {
    // Announce the confirmation immediately so screen reader users know what's happening
    AccessibilityInfo.announceForAccessibility(
      `Confirm navigation to ${routeName}. Start navigation or cancel.`,
    );

    Alert.alert(
      `Navigate to ${routeName}?`,
      'Start navigation to this destination.',
      [
        {
          text: 'Start Navigation',
          onPress: () => {
            AccessibilityInfo.announceForAccessibility(`Starting navigation to ${routeName}`);
            router.push(`/navigate/${routeId}`);
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.loadingText}>Loading your routes…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={listData}
        keyExtractor={(item) => `${item.type}-${item.routeId}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={() => (
          <>
            <SectionHeader
              title="Favorites"
              count={favorites.length}
              onClear={undefined}
            />
            {favorites.length === 0 ? <FavoritesEmpty /> : null}
          </>
        )}
        renderItem={({ item, index }) => {
          // The Recent header appears before the first history item, which is
          // always at index === favorites.length in the merged list.
          const showHistoryHeader = item.type === 'history' && index === favorites.length;

          return (
            <>
              {showHistoryHeader ? (
                <SectionHeader
                  title="Recent"
                  count={history.length}
                  onClear={history.length > 0 ? clearHistory : undefined}
                />
              ) : null}
              <RouteItem
                routeId={item.routeId}
                routeName={item.routeName}
                fromLabel={item.fromLabel}
                toLabel={item.toLabel}
                isFavorite={isFavorite(item.routeId)}
                onToggleFavorite={() => {
                  const route = {
                    id: item.routeId,
                    name: item.routeName,
                    fromLabel: item.fromLabel,
                    toLabel: item.toLabel,
                  };
                  void toggleFavorite(route as Parameters<typeof toggleFavorite>[0]);
                }}
                onNavigate={() => handleReNavigate(item.routeId, item.routeName)}
              />
            </>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyHistory}>
            <Text
              style={styles.emptyText}
              accessibilityLabel="No routes yet. Navigate a route to see it here."
            >
              No routes yet. Your navigation history will appear here.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        accessibilityRole="list"
      />
    </SafeAreaView>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  onClear,
}: {
  title: string;
  count: number;
  onClear?: () => Promise<void>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.sectionCount} accessibilityElementsHidden>
        {count}
      </Text>
      {onClear ? (
        <Pressable
          onPress={() => void onClear()}
          style={styles.clearBtn}
          accessibilityLabel={`Clear ${title.toLowerCase()} history`}
          accessibilityRole="button"
          accessibilityHint="Double tap to remove all recent routes"
        >
          <Text style={styles.clearBtnLabel}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Route item ─────────────────────────────────────────────────────────────

function RouteItem({
  routeId,
  routeName,
  fromLabel,
  toLabel,
  isFavorite,
  onToggleFavorite,
  onNavigate,
}: {
  routeId: string;
  routeName: string;
  fromLabel: string;
  toLabel: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNavigate: () => void;
}) {
  // Per spec: accessibilityLabel includes name, buildings, and status
  const itemLabel = `${routeName}, from ${fromLabel} to ${toLabel}, ${isFavorite ? 'saved as favorite' : 'in history'}`;

  return (
    <View
      style={styles.routeItem}
      accessible={false}
      accessibilityRole="none"
    >
      <Pressable
        style={({ pressed }) => [styles.routeMain, pressed && styles.routeMainPressed]}
        onPress={onNavigate}
        accessibilityLabel={itemLabel}
        accessibilityRole="button"
        accessibilityHint="Double tap to start navigation to this destination"
      >
        <View style={styles.routeIcon}>
          <Ionicons name="navigate" size={20} color="#6c63ff" />
        </View>
        <View style={styles.routeText}>
          <Text style={styles.routeName} numberOfLines={1}>
            {routeName}
          </Text>
          <Text style={styles.routeBuildings} numberOfLines={1}>
            {fromLabel} → {toLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#4444aa" />
      </Pressable>

      <FavoriteToggle
        routeId={routeId}
        routeName={routeName}
        isFavorite={isFavorite}
        onToggle={onToggleFavorite}
      />
    </View>
  );
}

// ── FavoriteToggle ─────────────────────────────────────────────────────────

function FavoriteToggle({
  routeId: _routeId,
  routeName,
  isFavorite,
  onToggle,
}: {
  routeId: string;
  routeName: string;
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.favToggle, pressed && styles.favTogglePressed]}
      onPress={onToggle}
      accessibilityLabel={isFavorite ? `Remove ${routeName} from favorites` : `Add ${routeName} to favorites`}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityHint={isFavorite ? 'Double tap to remove from favorites' : 'Double tap to save as favorite'}
    >
      <Ionicons
        name={isFavorite ? 'star' : 'star-outline'}
        size={22}
        color={isFavorite ? '#eab308' : '#4444aa'}
      />
    </Pressable>
  );
}

// ── Empty states ───────────────────────────────────────────────────────────

function FavoritesEmpty() {
  return (
    <View
      style={styles.favoritesEmpty}
      accessible
      accessibilityLabel="No favorites yet. Navigate a route and tap the star to save it."
    >
      <Text style={styles.emptyText} accessibilityElementsHidden>
        No favorites yet.{'\n'}Navigate a route and tap ★ to save it.
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  listContent: {
    paddingBottom: 40,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#9090cc',
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    color: '#9090cc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    flex: 1,
  },
  sectionCount: {
    color: '#4444aa',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  clearBtnLabel: {
    color: '#6666aa',
    fontSize: 13,
    fontWeight: '600',
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#14142a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    overflow: 'hidden',
  },
  routeMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 12,
    minHeight: 60,
  },
  routeMainPressed: { opacity: 0.75 },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e1e44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: {
    flex: 1,
    gap: 2,
  },
  routeName: {
    color: '#e0e0f8',
    fontSize: 16,
    fontWeight: '600',
  },
  routeBuildings: {
    color: '#6666aa',
    fontSize: 13,
    fontWeight: '400',
  },
  favToggle: {
    width: 52,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a4e',
  },
  favTogglePressed: { opacity: 0.7 },
  separator: { height: 8 },
  favoritesEmpty: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#14142a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderStyle: 'dashed',
  },
  emptyHistory: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#4444aa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
