import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
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

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && profile && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, profile, isLoading, segments, router]);
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
