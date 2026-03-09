import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AdminUser } from '@echoecho/shared';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  profile: AdminUser | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: false,
  error: null,

  setSession: (session) => {
    set({ session });
    if (session) {
      get().refreshProfile();
    } else {
      set({ profile: null });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      set({ session: data.session });
      await get().refreshProfile();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign in failed' });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null });
    try {
      await supabase.auth.signOut();
      set({ session: null, profile: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign out failed' });
    } finally {
      set({ isLoading: false });
    }
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'echoecho://auth/reset-password',
    });
    if (error) throw error;
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, campus_id, is_active')
      .eq('id', session.user.id)
      .single();

    if (error || !data) {
      set({ profile: null });
      return;
    }

    // Force sign-out if account has been deactivated
    if (!data.is_active) {
      await supabase.auth.signOut();
      set({ session: null, profile: null, error: 'Account has been deactivated.' });
      return;
    }

    set({
      profile: {
        id: data.id,
        email: session.user.email ?? '',
        displayName: session.user.email ?? '',
        role: data.role as AdminUser['role'],
        campusIds: data.campus_id ? [data.campus_id] : [],
        createdAt: session.user.created_at,
        updatedAt: session.user.updated_at ?? session.user.created_at,
      },
    });
  },
}));
