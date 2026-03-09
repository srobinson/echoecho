import { useState, useCallback, useEffect } from 'react';
import type {
  RouteUsageStat,
  TimeOfDayStat,
  OffRoutePoint,
  TopDestination,
  CampusCoverage,
  CompletionRateRow,
} from '@echoecho/shared';
import {
  fetchRouteUsage,
  fetchTimeOfDay,
  fetchOffRouteHeatmap,
  fetchTopDestinations,
  fetchCampusCoverage,
  deriveCompletionRates,
} from '../services/analyticsService';

interface AnalyticsData {
  routeUsage: RouteUsageStat[];
  timeOfDay: TimeOfDayStat[];
  offRoutePoints: OffRoutePoint[];
  topDestinations: TopDestination[];
  coverage: CampusCoverage;
  completionRates: CompletionRateRow[];
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

export function useAnalytics(campusId: string | null): AnalyticsData {
  const [routeUsage, setRouteUsage] = useState<RouteUsageStat[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayStat[]>([]);
  const [offRoutePoints, setOffRoutePoints] = useState<OffRoutePoint[]>([]);
  const [topDestinations, setTopDestinations] = useState<TopDestination[]>([]);
  const [coverage, setCoverage] = useState<CampusCoverage>({ publishedPairs: 0, totalPairs: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAll = useCallback(async (refreshing = false) => {
    if (!campusId) return;
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const [usage, tod, heatmap, dests, cov] = await Promise.all([
      fetchRouteUsage(campusId),
      fetchTimeOfDay(campusId),
      fetchOffRouteHeatmap(campusId),
      fetchTopDestinations(campusId),
      fetchCampusCoverage(campusId),
    ]);

    setRouteUsage(usage);
    setTimeOfDay(tod);
    setOffRoutePoints(heatmap);
    setTopDestinations(dests);
    setCoverage(cov);

    setIsLoading(false);
    setIsRefreshing(false);
  }, [campusId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refresh = useCallback(() => loadAll(true), [loadAll]);

  const completionRates = deriveCompletionRates(routeUsage);

  return {
    routeUsage,
    timeOfDay,
    offRoutePoints,
    topDestinations,
    coverage,
    completionRates,
    isLoading,
    isRefreshing,
    refresh,
  };
}
