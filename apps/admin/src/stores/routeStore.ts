import { create } from 'zustand';
import type { Route } from '@echoecho/shared';

interface RouteStore {
  routes: Route[];
  activeRoute: Route | null;
  isLoading: boolean;
  error: string | null;
  setRoutes: (routes: Route[]) => void;
  setActiveRoute: (route: Route | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  upsertRoute: (route: Route) => void;
  removeRoute: (routeId: string) => void;
}

export const useRouteStore = create<RouteStore>((set, get) => ({
  routes: [],
  activeRoute: null,
  isLoading: false,
  error: null,

  setRoutes: (routes) => set({ routes }),
  setActiveRoute: (route) => set({ activeRoute: route }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  upsertRoute: (route) => {
    const existing = get().routes;
    const idx = existing.findIndex((r) => r.id === route.id);
    if (idx === -1) {
      set({ routes: [...existing, route] });
    } else {
      const updated = [...existing];
      updated[idx] = route;
      set({ routes: updated });
    }
  },

  removeRoute: (routeId) => {
    set({ routes: get().routes.filter((r) => r.id !== routeId) });
  },
}));
