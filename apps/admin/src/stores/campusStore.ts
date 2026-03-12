import { create } from 'zustand';
import type { Campus } from '@echoecho/shared';

interface CampusStore {
  campuses: Campus[];
  activeCampus: Campus | null;
  isLoading: boolean;
  error: string | null;
  setActiveCampus: (campus: Campus | null) => void;
  setCampuses: (campuses: Campus[]) => void;
  addCampus: (campus: Campus) => void;
  removeCampus: (campusId: string, nextActiveCampus?: Campus | null) => void;
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
  addCampus: (campus) => set((s) => ({
    campuses: [...s.campuses, campus].sort((a, b) => a.name.localeCompare(b.name)),
  })),
  removeCampus: (campusId, nextActiveCampus) => set((s) => ({
    campuses: s.campuses.filter((campus) => campus.id !== campusId),
    activeCampus: s.activeCampus?.id === campusId
      ? (nextActiveCampus ?? null)
      : s.activeCampus,
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
