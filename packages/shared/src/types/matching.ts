/**
 * Types for the match_route RPC (ALP-955).
 *
 * The RPC accepts a GPS position and free-text destination, and returns
 * published routes ranked by a composite score:
 *   0.5 × destination name similarity
 *   0.3 × inverse route distance
 *   0.2 × difficulty bonus
 */

export interface MatchRouteRequest {
  lat: number;
  lng: number;
  /** Raw spoken or typed destination text. */
  destinationText: string;
  campusId: string;
  /** Number of matches to return. Defaults to 3. */
  limit?: number;
}

export interface RouteMatch {
  routeId: string;
  routeName: string;
  startBuildingId: string;
  startBuildingName: string;
  endBuildingId: string;
  endBuildingName: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  tags: string[];
  totalDistanceM: number;
  /** Estimated walk time: totalDistanceM / 1.2 m/s (average walking speed). */
  walkTimeEstimateS: number;
  /** Composite ranking score (0.0–1.0+ range). */
  matchScore: number;
  /** pg_trgm similarity between destination text and end building name. */
  destinationSimilarity: number;
  /** Great-circle distance from user position to the route start point. */
  distanceToStartM: number;
}

export interface MatchRouteResponse {
  /** Top-N routes ranked by matchScore. Empty array when no routes match. */
  matches: RouteMatch[];
  /** Nearest building to the user's position. Null if campus has no buildings. */
  nearestBuildingId: string | null;
  nearestBuildingName: string | null;
  /**
   * True when no building name reaches the 0.15 similarity threshold for the
   * destination text. The app should prompt the user to repeat or spell the
   * destination.
   */
  unmatchedDestination: boolean;
}

/** Machine-readable error codes returned by match_route. */
export type MatchRouteErrorCode =
  | 'NO_ROUTES_FOUND'
  | 'CAMPUS_NOT_FOUND'
  | 'INVALID_POSITION'
  | 'AUTHENTICATION_REQUIRED'
  | 'UNKNOWN_ERROR';

export interface MatchRouteError {
  code: MatchRouteErrorCode;
  message: string;
}
