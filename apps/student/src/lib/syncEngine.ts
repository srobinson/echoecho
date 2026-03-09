/**
 * Campus sync engine for offline navigation (ALP-963).
 *
 * Incrementally syncs published routes from Supabase to local SQLite using
 * content_hash comparison. Only stale routes are re-fetched; unchanged routes
 * are skipped entirely.
 *
 * Trigger points (callers are responsible for invoking syncCampus):
 *   - App foreground resume (throttled: skipped if last sync < 15 min ago)
 *   - Explicit user pull-to-refresh (bypass throttle)
 *   - After routeMatchingService pre-loads a single route (already handled there)
 *
 * Navigation safety: the active route's local data is never modified mid-session.
 * Pass the currently active routeId to syncCampus to skip it during sync.
 */

import { supabase } from './supabase';
import {
  upsertRoute,
  getAllRouteHashes,
  markRouteRetracted,
  updateSyncState,
  getLastSyncedAt,
  type UpsertWaypointInput,
} from './localDb';
import { cacheRouteMedia } from './mediaCache';

const SYNC_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

interface ServerRouteHeader {
  id: string;
  content_hash: string;
  status: string;
  campus_id: string;
  name: string;
  difficulty: string;
  tags: string[];
  total_distance_m: number | null;
}

/**
 * Syncs all published routes for a campus and detects retractions by absence.
 *
 * @param campusId       The campus to sync.
 * @param activeRouteId  Skip writing this route — it is currently being navigated.
 * @param force          Bypass the 15-minute throttle (user-initiated refresh).
 */
export async function syncCampus(
  campusId: string,
  activeRouteId?: string,
  force = false
): Promise<void> {
  // Throttle guard — skip if last sync was recent (unless forced).
  if (!force) {
    const lastSync = await getLastSyncedAt(campusId);
    if (lastSync && Date.now() - lastSync < SYNC_THROTTLE_MS) {
      return;
    }
  }

  // Fetch only published route headers. RLS blocks retracted routes for
  // anonymous users anyway. Retractions are detected by absence: any locally
  // cached route that no longer appears in the published set is marked retracted.
  const { data: serverRoutes, error: routesError } = await supabase
    .from('routes')
    .select('id, content_hash, status, campus_id, name, difficulty, tags, total_distance_m')
    .eq('campus_id', campusId)
    .eq('status', 'published');

  if (routesError) {
    console.error('[syncEngine] Failed to fetch route headers:', routesError);
    return;
  }

  const routes = (serverRoutes ?? []) as ServerRouteHeader[];
  const serverRouteIds = new Set(routes.map((r) => r.id));

  // Compare content_hash against local cache. Stale = missing or hash changed.
  const localHashes = await getAllRouteHashes(campusId);

  // Mark locally cached routes that are absent from the server as retracted.
  // This catches routes that were published, cached, then administratively retracted.
  for (const localRouteId of Object.keys(localHashes)) {
    if (!serverRouteIds.has(localRouteId) && localRouteId !== activeRouteId) {
      await markRouteRetracted(localRouteId);
    }
  }

  const staleRoutes = routes.filter(
    (r) => !localHashes[r.id] || localHashes[r.id] !== r.content_hash
  );

  for (const route of staleRoutes) {
    // Skip the active navigation route — never modify data mid-session.
    if (activeRouteId && route.id === activeRouteId) {
      continue;
    }

    // Fetch full waypoint payload for stale routes.
    const { data: serverWaypoints, error: waypointError } = await supabase
      .from('waypoints')
      .select(
        'id, position, heading, annotation_text, annotation_audio_url, hazard_type, geom'
      )
      .eq('route_id', route.id)
      .order('position');

    if (waypointError) {
      console.error(`[syncEngine] Failed to fetch waypoints for route ${route.id}:`, waypointError);
      continue;
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
        tags: route.tags,
        status: route.status,
        totalDistanceM: route.total_distance_m,
        contentHash: route.content_hash,
      },
      upsertWaypoints
    );

    // Download audio annotations; failures fall back to TTS on annotation_text.
    await cacheRouteMedia(
      route.id,
      waypoints.map((wp) => ({
        id: wp.id,
        annotation_audio_url: wp.annotation_audio_url,
        annotation_text: wp.annotation_text,
      }))
    );
  }

  await updateSyncState(campusId, Date.now());
}
