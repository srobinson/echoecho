import { create } from 'zustand';

interface MapViewportStore {
  campusId: string | null;
  center: [number, number] | null;
  zoom: number | null;
  setViewport: (center: [number, number], zoom: number, campusId?: string | null) => void;
}

export const useMapViewportStore = create<MapViewportStore>((set) => ({
  campusId: null,
  center: null,
  zoom: null,
  setViewport: (center, zoom, campusId = null) => set({ center, zoom, campusId }),
}));
