import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogBox } from 'react-native';

// Suppress the Supabase AuthApiError alert that surfaces in dev builds
// when a stale refresh token is encountered after app reinstall.
LogBox.ignoreLogs(['AuthApiError', 'Invalid Refresh Token']);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const SESSION_KEY = 'echoecho-student-session';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: SESSION_KEY,
  },
});

/**
 * Ensures the student app has an active, validated auth session.
 *
 * On reinstall the old session token is orphaned. We validate first,
 * clear on failure, and fall back to a fresh anonymous sign-in.
 */
export async function ensureAnonymousSession(): Promise<{ ok: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) return { ok: true };
    await supabase.auth.signOut().catch(() => {});
  }

  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { app: 'student' } },
  });
  if (error) {
    console.error('[supabase] Anonymous sign-in failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}
