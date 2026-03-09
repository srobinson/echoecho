/**
 * useAdminMapData — fetches buildings and routes for the admin map layers.
 *
 * ALP-965: Data hook consumed by BuildingLayer, RouteLayer, PoiLayer.
 * Fetches on mount when campusId changes. Results flow into the map layer
 * components as pre-fetched GeoJSON feature data.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Building, Route, Waypoint } from '@echoecho/shared';

export interface AdminMapData {
  buildings: Building[];
  routes: Route[];
  /** Annotation waypoints across all routes — for PoiLayer */
  annotationWaypoints: Waypoint[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAdminMapData(campusId: string | null): AdminMapData {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMapData = useCallback(async () => {
    if (!campusId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [buildingsResult, routesResult] = await Promise.all([
        supabase
          .from('v_buildings' as 'buildings')
          .select('*')
          .eq('campusId' as 'campus_id', campusId),
        supabase
          .from('v_routes' as 'routes')
          .select('*')
          .eq('campusId' as 'campus_id', campusId)
          .in('status', ['draft', 'published']),
      ]);

      if (buildingsResult.error) throw new Error(buildingsResult.error.message);
      if (routesResult.error) throw new Error(routesResult.error.message);

      setBuildings((buildingsResult.data ?? []) as Building[]);
      setRoutes((routesResult.data ?? []) as Route[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load map data');
    } finally {
      setIsLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    void fetchMapData();
  }, [fetchMapData]);

  const annotationWaypoints = useMemo(
    () =>
      routes
        .flatMap((r) => r.waypoints)
        .filter((w) => w.audioLabel != null || w.type !== 'regular'),
    [routes],
  );

  return {
    buildings,
    routes,
    annotationWaypoints,
    isLoading,
    error,
    refresh: fetchMapData,
  };
}
