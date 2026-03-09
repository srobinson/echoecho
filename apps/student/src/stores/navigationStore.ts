import { create } from 'zustand';
import type {
  NavigationSession,
  SavedDestination,
  Route,
} from '@echoecho/shared';

interface NavigationStore {
  currentSession: NavigationSession | null;
  savedDestinations: SavedDestination[];
  availableRoutes: Route[];
  isLoading: boolean;
  error: string | null;
  /** Authenticated student user ID — set after Supabase auth */
  userId: string | null;
  setCurrentSession: (session: NavigationSession | null) => void;
  setSavedDestinations: (destinations: SavedDestination[]) => void;
  setAvailableRoutes: (routes: Route[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUserId: (id: string | null) => void;
  endNavigation: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentSession: null,
  savedDestinations: [],
  availableRoutes: [],
  isLoading: false,
  error: null,
  userId: null,

  setCurrentSession: (session) => set({ currentSession: session }),
  setSavedDestinations: (savedDestinations) => set({ savedDestinations }),
  setAvailableRoutes: (availableRoutes) => set({ availableRoutes }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setUserId: (userId) => set({ userId }),
  endNavigation: () => set({ currentSession: null }),
}));
