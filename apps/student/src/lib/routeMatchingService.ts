/**
 * Route matching and pre-load service (ALP-955).
 *
 * Calls the `match_route` Postgres RPC to find published routes near the user
 * that match a spoken/typed destination. When the user selects a route, pre-loads
 * its waypoints to local SQLite using the same `upsertRoute` function as the
 * sync engine — guaranteeing a single write path.
 */

import { supabase } from './supabase';
import { upsertRoute, type UpsertWaypointInput } from './localDb';
import { cacheRouteMedia } from './mediaCache';
import type {
  MatchRouteRequest,
  MatchRouteResponse,
  RouteMatch,
  MatchRouteError,
} from '@echoecho/shared';

// ── RPC response shapes ────────────────────────────────────────────────────

interface RpcRouteMatch {
  route_id: string;
  route_name: string;
  start_building_id: string;
  start_building_name: string;
  end_building_id: string;
  end_building_name: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  tags: string[];
  total_distance_m: number;
  walk_time_estimate_s: number;
  destination_similarity: number;
  distance_to_start_m: number;
  match_score: number;
}

interface RpcResponse {
  matches: RpcRouteMatch[];
  nearest_building_id: string | null;
  nearest_building_name: string | null;
  unmatched_destination: boolean;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Calls the match_route RPC and maps snake_case fields to the shared TS contract.
 *
 * Returns a typed MatchRouteResponse. Empty matches array (not an error) when
 * no published routes connect the nearest building to the destination.
 */
export async function matchRoute(
  request: MatchRouteRequest
): Promise<{ data: MatchRouteResponse } | { error: MatchRouteError }> {
  const { data, error } = await supabase.rpc('match_route', {
    p_lat:              request.lat,
    p_lng:              request.lng,
    p_destination_text: request.destinationText,
    p_campus_id:        request.campusId,
    p_limit:            request.limit ?? 3,
  });

  if (error) {
    return {
      error: {
        code: mapErrorCode(error.message),
        message: error.message,
      },
    };
  }

  const rpc = data as RpcResponse;

  const response: MatchRouteResponse = {
    matches: (rpc.matches ?? []).map(
      (m: RpcRouteMatch): RouteMatch => ({
        routeId:               m.route_id,
        routeName:             m.route_name,
        startBuildingId:       m.start_building_id,
        startBuildingName:     m.start_building_name,
        endBuildingId:         m.end_building_id,
        endBuildingName:       m.end_building_name,
        difficulty:            m.difficulty,
        tags:                  m.tags ?? [],
        totalDistanceM:        m.total_distance_m,
        walkTimeEstimateS:     m.walk_time_estimate_s,
        matchScore:            m.match_score,
        destinationSimilarity: m.destination_similarity,
        distanceToStartM:      m.distance_to_start_m,
      })
    ),
    nearestBuildingId:   rpc.nearest_building_id,
    nearestBuildingName: rpc.nearest_building_name,
    unmatchedDestination: rpc.unmatched_destination,
  };

  return { data: response };
}

/**
 * Pre-loads a selected route's waypoints to local SQLite.
 *
 * Called immediately after the user picks a route from the match results.
 * Uses the same `upsertRoute` function as the sync engine — single implementation,
 * two call sites (ALP-963 contract).
 */
export async function preloadRoute(routeId: string): Promise<void> {
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('id, campus_id, name, difficulty, tags, status, total_distance_m, content_hash')
    .eq('id', routeId)
    .eq('status', 'published')
    .single();

  if (routeError || !route) {
    throw new Error(`Route ${routeId} not found or not published`);
  }

  // Fetch ordered waypoints.
  const { data: serverWaypoints, error: waypointError } = await supabase
    .from('waypoints')
    .select(
      'id, position, heading, annotation_text, annotation_audio_url, hazard_type, geom'
    )
    .eq('route_id', routeId)
    .order('position');

  if (waypointError) {
    throw new Error(`Failed to fetch waypoints for route ${routeId}: ${waypointError.message}`);
  }

  const waypoints = (serverWaypoints ?? []) as Array<{
    id: string;
    position: number;
    heading: number | null;
    annotation_text: string | null;
    annotation_audio_url: string | null;
    hazard_type: string | null;
    geom: { coordinates: [number, number] } | null;
  }>;

  const upsertWaypoints: UpsertWaypointInput[] = waypoints.map((wp) => ({
    id: wp.id,
    position: wp.position,
    lat: wp.geom?.coordinates[1] ?? 0,
    lng: wp.geom?.coordinates[0] ?? 0,
    heading: wp.heading,
    annotationText: wp.annotation_text,
    hazardType: wp.hazard_type,
  }));

  await upsertRoute(
    {
      id: route.id,
      campusId: route.campus_id,
      name: route.name,
      difficulty: route.difficulty,
      tags: route.tags ?? [],
      status: route.status,
      totalDistanceM: route.total_distance_m,
      contentHash: route.content_hash,
    },
    upsertWaypoints
  );

  await cacheRouteMedia(
    routeId,
    waypoints.map((wp) => ({
      id: wp.id,
      annotation_audio_url: wp.annotation_audio_url,
      annotation_text: wp.annotation_text,
    }))
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapErrorCode(message: string): MatchRouteError['code'] {
  if (message.includes('campus_not_found'))          return 'CAMPUS_NOT_FOUND';
  if (message.includes('invalid_position'))           return 'INVALID_POSITION';
  if (message.includes('authentication_required'))    return 'AUTHENTICATION_REQUIRED';
  if (message.includes('no_routes'))                  return 'NO_ROUTES_FOUND';
  return 'UNKNOWN_ERROR';
}
