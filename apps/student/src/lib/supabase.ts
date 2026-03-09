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
 * Ensures the student app has an active auth session. Uses anonymous sign-in
 * so the Supabase client gets a real auth.uid(). Without this, RLS policies
 * deny all queries because current_user_role() returns NULL for unauthenticated
 * requests.
 *
 * Safe to call multiple times: if a session already exists it returns immediately.
 */
export async function ensureAnonymousSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[supabase] Anonymous sign-in failed:', error.message);
  }
}
