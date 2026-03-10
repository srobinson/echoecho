import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { AdminUser } from '@echoecho/shared';

/**
 * Redirects unauthenticated users to /login and authenticated users away from /login.
 * Call once at the root layout after useAuthListener.
 */
export function useProtectedRoute() {
  const router = useRouter();
  const segments = useSegments();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const profileLoading = useAuthStore((s) => s.profileLoading);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    // Wait until the persisted session has been resolved from AsyncStorage,
    // and until the profile fetch settles. Without the profileLoading guard,
    // a null profile during the async fetch would trigger a login redirect
    // for users with a valid persisted session.
    if (!initialized || isLoading || profileLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // No session at all — send to login.
      router.replace('/(auth)/login');
    } else if (session && !profile && !inAuthGroup) {
      // Session exists but the profile fetch resolved with no row (e.g. the
      // profiles trigger did not fire, or the account was deleted). Sign out
      // so the user lands on login with a clean state rather than on tabs
      // with a session that cannot query anything.
      void supabase.auth.signOut();
      router.replace('/(auth)/login');
    } else if (session && profile && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, profile, isLoading, profileLoading, initialized, segments, router]);
}

/**
 * Returns true if the current user has one of the given roles.
 * Use to conditionally render role-gated UI.
 */
export function useHasRole(...roles: AdminUser['role'][]) {
  const profile = useAuthStore((s) => s.profile);
  if (!profile) return false;
  return roles.includes(profile.role);
}
