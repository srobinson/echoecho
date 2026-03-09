import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

/**
 * Initializes auth state from the persisted session and listens for auth events.
 * Call once at the root layout. Returns nothing — components read from useAuthStore.
 *
 * Key behaviors:
 * - Restores session on cold start from AsyncStorage
 * - Redirects to login when session expires or is revoked
 * - Re-validates the session on app foreground (catches server-side deactivation)
 * - Token refresh is handled automatically by the Supabase JS client
 */
export function useAuthListener() {
  const setSession = useAuthStore((s) => s.setSession);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Bootstrap: restore persisted session before first render.
    // The .catch() ensures initialized is always set even when AsyncStorage
    // or the network is unavailable — without it the app hangs on the splash screen.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch(() => {
      setSession(null);
    });

    // Listen for auth state changes (login, logout, token refresh, user updated)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Re-validate session on app foreground to catch server-side deactivation
    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      const wasBackground =
        appState.current === 'background' || appState.current === 'inactive';
      appState.current = nextState;

      if (nextState === 'active' && wasBackground) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Re-check profile (is_active may have changed while backgrounded)
            await refreshProfile();
          } else {
            setSession(null);
          }
        } catch {
          // Network unavailable on foreground — leave auth state as-is.
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [setSession, refreshProfile]);
}
