import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'echoecho-student-session',
  },
});

/**
 * Ensures the student app has an active, validated auth session.
 *
 * getSession() returns the cached session from local storage without network
 * validation. An expired session whose refresh token has also expired still
 * returns a non-null object. We call refreshSession() to validate it over the
 * network, and fall back to a fresh anonymous sign-in if refresh fails.
 *
 * Returns { ok: true } when a valid session is established, { ok: false } when
 * all attempts fail. Callers should gate network operations on the result.
 */
export async function ensureAnonymousSession(): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) return { ok: true };
    console.warn('[supabase] Session refresh failed, re-authenticating:', refreshError.message);
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[supabase] Anonymous sign-in failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}
