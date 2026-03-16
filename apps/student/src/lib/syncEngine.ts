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

// Mutex: concurrent callers wait for the in-progress sync rather than
// spawning redundant parallel fetches.
let activeSyncPromise: Promise<void> | null = null;

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
  force = false,
): Promise<void> {
  // If a sync is already running, wait for it instead of starting another.
  if (activeSyncPromise) {
    console.log('[syncEngine] Sync already in progress, waiting...');
    await activeSyncPromise;
    return;
  }

  // Throttle guard — skip if last sync was recent (unless forced).
  if (!force) {
    const lastSync = await getLastSyncedAt(campusId);
    if (lastSync && Date.now() - lastSync < SYNC_THROTTLE_MS) {
      return;
    }
  }

  activeSyncPromise = doSync(campusId, activeRouteId);
  try {
    await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

async function doSync(campusId: string, activeRouteId?: string): Promise<void> {
  console.log(`[syncEngine] Fetching published routes for campus ${campusId}`);
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
  console.log(`[syncEngine] Got ${routes.length} published routes from server`);
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
    (r) => !localHashes[r.id] || localHashes[r.id] !== r.content_hash,
  );
  console.log(
    `[syncEngine] ${staleRoutes.length} stale routes to sync (${Object.keys(localHashes).length} cached locally)`,
  );

  const routesToSync = staleRoutes.filter((r) => !(activeRouteId && r.id === activeRouteId));

  // Fetch all waypoint payloads in parallel (network-bound, no DB contention).
  const waypointResults = await Promise.all(
    routesToSync.map((route) =>
      supabase
        .from('waypoints')
        .select('id, position, heading, annotation_text, annotation_audio_url, hazard_type, geom')
        .eq('route_id', route.id)
        .order('position'),
    ),
  );

  // Write to SQLite sequentially (SQLite does not support concurrent writes).
  for (let i = 0; i < routesToSync.length; i++) {
    const route = routesToSync[i];
    const { data: serverWaypoints, error: waypointError } = waypointResults[i];

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

    console.log(
      `[syncEngine] Upserting route "${route.name}" with ${upsertWaypoints.length} waypoints`,
    );
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
      upsertWaypoints,
    );

    // Download audio annotations; failures fall back to TTS on annotation_text.
    await cacheRouteMedia(
      route.id,
      waypoints.map((wp) => ({
        id: wp.id,
        annotation_audio_url: wp.annotation_audio_url,
        annotation_text: wp.annotation_text,
      })),
    );
  }

  await updateSyncState(campusId, Date.now());
}
