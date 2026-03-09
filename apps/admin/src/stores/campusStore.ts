import { create } from 'zustand';
import type { Campus } from '@echoecho/shared';

interface CampusStore {
  campuses: Campus[];
  activeCampus: Campus | null;
  isLoading: boolean;
  error: string | null;
  setActiveCampus: (campus: Campus | null) => void;
  setCampuses: (campuses: Campus[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCampusStore = create<CampusStore>((set) => ({
  campuses: [],
  activeCampus: null,
  isLoading: false,
  error: null,

  setActiveCampus: (campus) => set({ activeCampus: campus }),
  setCampuses: (campuses) => set({ campuses }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
