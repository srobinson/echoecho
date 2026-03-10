import { create } from 'zustand';

interface MapViewportStore {
  center: [number, number] | null;
  zoom: number | null;
  setViewport: (center: [number, number], zoom: number) => void;
}

export const useMapViewportStore = create<MapViewportStore>((set) => ({
  center: null,
  zoom: null,
  setViewport: (center, zoom) => set({ center, zoom }),
}));
