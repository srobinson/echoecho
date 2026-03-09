/**
 * Analytics data types for the admin dashboard.
 * All data is aggregate-only. No individual session identifiers.
 */

export interface RouteUsageStat {
  routeId: string;
  name: string;
  navigationCount: number;
  completionRate: number;
  offRouteFrequency: number;
}

export interface TimeOfDayStat {
  hour: number;
  count: number;
}

export interface OffRoutePoint {
  coordinates: [number, number];
  weight: number;
}

export interface TopDestination {
  buildingId: string;
  name: string;
  count: number;
}

export interface CampusCoverage {
  publishedPairs: number;
  totalPairs: number;
}

export interface CompletionRateRow {
  routeId: string;
  name: string;
  totalNavigations: number;
  completions: number;
  completionPercent: number;
}
