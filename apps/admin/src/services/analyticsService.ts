import { supabase } from '../lib/supabase';
import type {
  RouteUsageStat,
  TimeOfDayStat,
  OffRoutePoint,
  TopDestination,
  CampusCoverage,
  CompletionRateRow,
} from '@echoecho/shared';

/**
 * Analytics API client.
 *
 * Each function calls a Supabase RPC (database function) that returns
 * pre-aggregated data. The backend engineer implements these RPCs.
 * If the RPC does not exist yet, the function returns empty results
 * so the UI can render gracefully with empty states.
 */

export async function fetchRouteUsage(campusId: string): Promise<RouteUsageStat[]> {
  const { data, error } = await supabase.rpc('analytics_route_usage', {
    p_campus_id: campusId,
  });
  if (error || !data) return [];
  return (data as unknown as RouteUsageStat[]).slice(0, 10);
}

export async function fetchTimeOfDay(campusId: string): Promise<TimeOfDayStat[]> {
  const { data, error } = await supabase.rpc('analytics_time_of_day', {
    p_campus_id: campusId,
  });
  if (error || !data) return [];
  return data as unknown as TimeOfDayStat[];
}

export async function fetchOffRouteHeatmap(campusId: string): Promise<OffRoutePoint[]> {
  const { data, error } = await supabase.rpc('analytics_off_route_heatmap', {
    p_campus_id: campusId,
  });
  if (error || !data) return [];
  return data as unknown as OffRoutePoint[];
}

export async function fetchTopDestinations(campusId: string): Promise<TopDestination[]> {
  const { data, error } = await supabase.rpc('analytics_top_destinations', {
    p_campus_id: campusId,
  });
  if (error || !data) return [];
  return data as unknown as TopDestination[];
}

export async function fetchCampusCoverage(campusId: string): Promise<CampusCoverage> {
  const { data, error } = await supabase.rpc('analytics_campus_coverage', {
    p_campus_id: campusId,
  });
  if (error || !data) return { publishedPairs: 0, totalPairs: 0 };
  return data as unknown as CampusCoverage;
}

export function deriveCompletionRates(routeUsage: RouteUsageStat[]): CompletionRateRow[] {
  return routeUsage.map((r) => ({
    routeId: r.routeId,
    name: r.name,
    totalNavigations: r.navigationCount,
    completions: Math.round(r.navigationCount * r.completionRate),
    completionPercent: Math.round(r.completionRate * 100),
  }));
}
