/**
 * useRouteHistory — favorites and navigation history management.
 *
 * ALP-964 spec:
 *   - Persistence: Supabase user_route_history table (survives reinstall) +
 *     AsyncStorage as offline cache with optimistic writes
 *   - Favorite toggle: optimistic local update + background Supabase upsert.
 *     On error: revert + AccessibilityInfo announcement.
 *   - History write: on navigation session end, append route ID.
 *     Enforce 20-item FIFO cap.
 *   - History fetched on mount from AsyncStorage (instant) then Supabase.
 *
 * This hook is injected into the navigation store on session end. It does not
 * have internal React state — it operates on the zustand store directly.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Route } from '@echoecho/shared';

const HISTORY_STORAGE_KEY = '@echoecho/route_history';
const FAVORITES_STORAGE_KEY = '@echoecho/route_favorites';
const HISTORY_CAP = 20;

export interface HistoryEntry {
  routeId: string;
  routeName: string;
  fromLabel: string;
  toLabel: string;
  navigatedAt: string;
}

export interface FavoriteEntry {
  routeId: string;
  routeName: string;
  fromLabel: string;
  toLabel: string;
  savedAt: string;
}

export interface RouteHistoryState {
  history: HistoryEntry[];
  favorites: FavoriteEntry[];
  isLoading: boolean;
  toggleFavorite: (route: Route) => Promise<void>;
  isFavorite: (routeId: string) => boolean;
  appendHistory: (route: Route) => Promise<void>;
  clearHistory: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRouteHistory(userId: string | null): RouteHistoryState {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Load from cache then Supabase ─────────────────────────────────────────

  const loadFromCache = useCallback(async () => {
    try {
      const [histJson, favJson] = await Promise.all([
        AsyncStorage.getItem(HISTORY_STORAGE_KEY),
        AsyncStorage.getItem(FAVORITES_STORAGE_KEY),
      ]);
      if (histJson) setHistory(JSON.parse(histJson) as HistoryEntry[]);
      if (favJson) setFavorites(JSON.parse(favJson) as FavoriteEntry[]);
    } catch {
      // Cache miss is non-fatal
    }
  }, []);

  const loadFromSupabase = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: rows, error } = await supabase
        .from('user_route_history')
        .select('route_id, route_name, from_label, to_label, navigated_at, is_favorite')
        .eq('user_id', userId)
        .order('navigated_at', { ascending: false })
        .limit(HISTORY_CAP + 100); // fetch extra to separate history vs favorites

      if (error || !rows) return;

      const typed = rows as Array<{
        route_id: string;
        route_name: string;
        from_label: string;
        to_label: string;
        navigated_at: string;
        is_favorite: boolean;
      }>;

      const newHistory: HistoryEntry[] = typed
        .filter((r) => !r.is_favorite)
        .slice(0, HISTORY_CAP)
        .map((r) => ({
          routeId: r.route_id,
          routeName: r.route_name,
          fromLabel: r.from_label,
          toLabel: r.to_label,
          navigatedAt: r.navigated_at,
        }));

      const newFavorites: FavoriteEntry[] = typed
        .filter((r) => r.is_favorite)
        .map((r) => ({
          routeId: r.route_id,
          routeName: r.route_name,
          fromLabel: r.from_label,
          toLabel: r.to_label,
          savedAt: r.navigated_at,
        }));

      setHistory(newHistory);
      setFavorites(newFavorites);

      // Persist to cache for next offline load
      await Promise.all([
        AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory)),
        AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites)),
      ]);
    } catch {
      // Network failure — cached data remains
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    await loadFromSupabase();
  }, [loadFromSupabase]);

  useEffect(() => {
    setIsLoading(true);
    void loadFromCache().then(async () => {
      setIsLoading(false);
      await loadFromSupabase();
    });
  }, [loadFromCache, loadFromSupabase]);

  // ── Favorite toggle — optimistic write ────────────────────────────────────

  const toggleFavorite = useCallback(
    async (route: Route) => {
      const alreadyFav = favorites.some((f) => f.routeId === route.id);

      if (alreadyFav) {
        // Optimistic remove
        const next = favorites.filter((f) => f.routeId !== route.id);
        setFavorites(next);
        await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
        AccessibilityInfo.announceForAccessibility('Removed from favorites');

        if (userId) {
          const { error } = await supabase
            .from('user_route_history')
            .update({ is_favorite: false })
            .eq('user_id', userId)
            .eq('route_id', route.id);

          if (error) {
            // Revert
            setFavorites(favorites);
            await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
            AccessibilityInfo.announceForAccessibility(
              'Could not save favorite. Please try again.',
            );
          }
        }
      } else {
        // Optimistic add
        const entry: FavoriteEntry = {
          routeId: route.id,
          routeName: route.name,
          fromLabel: route.fromLabel,
          toLabel: route.toLabel,
          savedAt: new Date().toISOString(),
        };
        const next = [entry, ...favorites];
        setFavorites(next);
        await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
        AccessibilityInfo.announceForAccessibility('Added to favorites');

        if (userId) {
          const { error } = await supabase
            .from('user_route_history')
            .upsert(
              {
                user_id: userId,
                route_id: route.id,
                route_name: route.name,
                from_label: route.fromLabel,
                to_label: route.toLabel,
                is_favorite: true,
                navigated_at: entry.savedAt,
              },
              { onConflict: 'user_id,route_id' },
            );

          if (error) {
            // Revert
            setFavorites(favorites);
            await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
            AccessibilityInfo.announceForAccessibility(
              'Could not save favorite. Please try again.',
            );
          }
        }
      }
    },
    [favorites, userId],
  );

  // ── Append to history on navigation session end ───────────────────────────

  const appendHistory = useCallback(
    async (route: Route) => {
      const entry: HistoryEntry = {
        routeId: route.id,
        routeName: route.name,
        fromLabel: route.fromLabel,
        toLabel: route.toLabel,
        navigatedAt: new Date().toISOString(),
      };

      // FIFO cap: remove oldest entries beyond cap
      const deduped = history.filter((h) => h.routeId !== route.id);
      const next = [entry, ...deduped].slice(0, HISTORY_CAP);
      setHistory(next);
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));

      if (userId) {
        // Omit is_favorite from the payload — on INSERT the schema default (false)
        // applies; on UPDATE the existing value is preserved. Including it as false
        // would silently de-favorite a route the user had saved.
        await supabase.from('user_route_history').upsert(
          {
            user_id: userId,
            route_id: route.id,
            route_name: route.name,
            from_label: route.fromLabel,
            to_label: route.toLabel,
            navigated_at: entry.navigatedAt,
          },
          { onConflict: 'user_id,route_id' },
        );
      }
    },
    [history, userId],
  );

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
    if (userId) {
      await supabase
        .from('user_route_history')
        .delete()
        .eq('user_id', userId)
        .eq('is_favorite', false);
    }
  }, [userId]);

  const isFavorite = useCallback(
    (routeId: string) => favorites.some((f) => f.routeId === routeId),
    [favorites],
  );

  return {
    history,
    favorites,
    isLoading,
    toggleFavorite,
    isFavorite,
    appendHistory,
    clearHistory,
    refresh,
  };
}
