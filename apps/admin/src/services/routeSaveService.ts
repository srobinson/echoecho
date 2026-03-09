/**
 * ALP-953: Route save flow with metadata.
 *
 * Orchestrates the mandatory save sequence (order is non-negotiable):
 *   1. Upload all pending audio clips → route-audio bucket
 *   2. Upload all pending photos      → route-photos bucket
 *   3. Call save_route() RPC          → atomic Postgres transaction
 *
 * Steps 1–2 are NOT transactional with Postgres. If step 3 fails, the Storage
 * objects become orphaned until the nightly cleanup Edge Function (ALP-942)
 * purges them. Do NOT retry the full sequence without generating new storage
 * keys — duplicate uploads produce duplicate orphans, not duplicated routes.
 */
import * as FileSystem from 'expo-file-system';

import { supabase } from '../lib/supabase';
import type { RecordingSession, PendingWaypoint } from '@echoecho/shared';

// ── Public types ──────────────────────────────────────────────────────────────

export type RouteDifficulty = 'easy' | 'moderate' | 'hard';
export type RouteTag =
  | 'indoor'
  | 'outdoor'
  | 'mixed'
  | 'stairs'
  | 'elevator'
  | 'accessible';

export interface RouteSaveMetadata {
  name: string;
  /** UUID of the start building. May be a newly-created stub ID. */
  startBuildingId: string;
  /** UUID of the end building. May be a newly-created stub ID. */
  endBuildingId: string;
  difficulty: RouteDifficulty;
  tags: RouteTag[];
}

export type SaveStage =
  | 'uploading_audio'
  | 'uploading_photos'
  | 'saving_to_database';

export type RouteSaveResult =
  | { ok: true; routeId: string }
  | { ok: false; stage: 'upload_audio' | 'upload_photo' | 'db'; error: string };

export type BuildingCreateResult =
  | { ok: true; buildingId: string }
  | { ok: false; error: string };

export type PublishResult = { ok: true } | { ok: false; error: string };

// ── Internal types ────────────────────────────────────────────────────────────

interface ResolvedMedia {
  audioUrl: string | null;
  photoUrl: string | null;
}

interface WaypointPayload {
  position: number;
  captured_at: number;
  latitude: number;
  longitude: number;
  heading: number | null;
  annotation_text: string | null;
  annotation_audio_url: string | null;
  photo_url: string | null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const AUDIO_BUCKET = 'route-audio';
const PHOTO_BUCKET = 'route-photos';

function isLocalUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('content://');
}

function getPublicUrl(bucket: string, storageKey: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(storageKey);
  return data.publicUrl;
}

async function uploadLocalFile(
  localUri: string,
  bucket: string,
  storageKey: string,
  contentType: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storageKey, bytes, { contentType, upsert: true });

    if (error) return { ok: false, error: error.message };

    return { ok: true, url: getPublicUrl(bucket, storageKey) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Media resolution ──────────────────────────────────────────────────────────

/**
 * Resolve Storage URLs for all pending waypoint media.
 *
 * Audio and photos uploaded during recording already have a storage key
 * (e.g. `pending/{localId}/audio.m4a`). Those that failed during recording
 * have a local `file://` URI and are uploaded here.
 *
 * Returns an error at the first upload failure; the caller must surface the
 * error and abort before touching the database.
 */
async function resolveWaypointMedia(
  waypoints: PendingWaypoint[],
  onStageChange: (stage: SaveStage) => void,
): Promise<
  | { ok: true; mediaMap: Map<string, ResolvedMedia> }
  | { ok: false; stage: 'upload_audio' | 'upload_photo'; error: string }
> {
  const mediaMap = new Map<string, ResolvedMedia>();

  // Initialise entries so photo pass can update them without a Map.get check
  for (const wp of waypoints) {
    mediaMap.set(wp.localId, { audioUrl: null, photoUrl: null });
  }

  // Step 1: audio
  onStageChange('uploading_audio');
  for (const wp of waypoints) {
    if (!wp.audioAnnotationUri) continue;

    let audioUrl: string;
    if (isLocalUri(wp.audioAnnotationUri)) {
      const storageKey = `pending/${wp.localId}/audio.m4a`;
      const upload = await uploadLocalFile(
        wp.audioAnnotationUri,
        AUDIO_BUCKET,
        storageKey,
        'audio/mp4',
      );
      if (!upload.ok) return { ok: false, stage: 'upload_audio', error: upload.error };
      audioUrl = upload.url;
    } else {
      // Already a storage key from recording-time upload
      audioUrl = getPublicUrl(AUDIO_BUCKET, wp.audioAnnotationUri);
    }

    mediaMap.set(wp.localId, { audioUrl, photoUrl: null });
  }

  // Step 2: photos
  onStageChange('uploading_photos');
  for (const wp of waypoints) {
    if (!wp.photoUri) continue;

    let photoUrl: string;
    if (isLocalUri(wp.photoUri)) {
      const storageKey = `pending/${wp.localId}/photo.jpg`;
      const upload = await uploadLocalFile(
        wp.photoUri,
        PHOTO_BUCKET,
        storageKey,
        'image/jpeg',
      );
      if (!upload.ok) return { ok: false, stage: 'upload_photo', error: upload.error };
      photoUrl = upload.url;
    } else {
      photoUrl = getPublicUrl(PHOTO_BUCKET, wp.photoUri);
    }

    const existing = mediaMap.get(wp.localId)!;
    mediaMap.set(wp.localId, { ...existing, photoUrl });
  }

  return { ok: true, mediaMap };
}

// ── Waypoint list assembly ────────────────────────────────────────────────────

/**
 * Build the ordered waypoint list to persist.
 *
 * Seeds start/end waypoints from the first and last raw track points when
 * the recorder did not explicitly mark them. Ensures the saved LineString
 * spans the full recorded walk rather than just the annotated segments.
 */
function buildWaypointList(session: RecordingSession): PendingWaypoint[] {
  const waypoints: PendingWaypoint[] = [...session.pendingWaypoints];

  const hasExplicitStart = waypoints.some((w) => w.type === 'start');
  const hasExplicitEnd   = waypoints.some((w) => w.type === 'end');

  if (session.trackPoints.length > 0) {
    const first = session.trackPoints[0];
    if (!hasExplicitStart) {
      waypoints.unshift({
        localId:            'auto-start',
        coordinate:         { latitude: first.latitude, longitude: first.longitude, altitude: first.altitude },
        type:               'start',
        audioLabel:         'Start',
        description:        null,
        photoUri:           null,
        audioAnnotationUri: null,
        capturedAt:         first.timestamp,
      });
    }

    const last = session.trackPoints[session.trackPoints.length - 1];
    if (!hasExplicitEnd && session.trackPoints.length > 1) {
      waypoints.push({
        localId:            'auto-end',
        coordinate:         { latitude: last.latitude, longitude: last.longitude, altitude: last.altitude },
        type:               'end',
        audioLabel:         'End',
        description:        null,
        photoUri:           null,
        audioAnnotationUri: null,
        capturedAt:         last.timestamp,
      });
    }
  }

  return waypoints.sort((a, b) => a.capturedAt - b.capturedAt);
}

/**
 * Serialize the waypoint list into the JSONB payload expected by save_route().
 */
function buildWaypointPayloads(
  waypoints: PendingWaypoint[],
  mediaMap: Map<string, ResolvedMedia>,
): WaypointPayload[] {
  return waypoints.map((wp, index) => {
    const media = mediaMap.get(wp.localId);
    return {
      position:              index + 1,
      captured_at:           wp.capturedAt,
      latitude:              wp.coordinate.latitude,
      longitude:             wp.coordinate.longitude,
      heading:               null,
      annotation_text:       wp.audioLabel,
      annotation_audio_url:  media?.audioUrl ?? null,
      photo_url:             media?.photoUrl ?? null,
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a building stub with a placeholder polygon (~10m²) so a route can be
 * saved before the admin panel (ALP-966) is used to draw the real footprint.
 *
 * The stub's polygon is centered on the provided coordinates and replaced when
 * an O&M specialist draws the real outline in the building editor.
 */
export async function createBuildingStub(
  campusId: string,
  name: string,
  lat: number,
  lng: number,
): Promise<BuildingCreateResult> {
  const { data, error } = await supabase.rpc('create_building_stub', {
    p_campus_id: campusId,
    p_name:      name,
    p_lat:       lat,
    p_lng:       lng,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, buildingId: data as string };
}

/**
 * Save a completed recording session as a route.
 *
 * Executes the mandatory ordered sequence:
 *   1. Upload pending audio (abort on first failure; do not proceed to DB)
 *   2. Upload pending photos (same)
 *   3. Call save_route() RPC (atomic; status goes pending_save → draft on commit)
 *
 * `onStageChange` receives progress updates for UI display.
 */
export async function saveRoute(
  session: RecordingSession,
  metadata: RouteSaveMetadata,
  onStageChange: (stage: SaveStage) => void,
): Promise<RouteSaveResult> {
  const orderedWaypoints = buildWaypointList(session);

  // Steps 1 + 2: resolve all Storage URLs before touching the DB
  const mediaResult = await resolveWaypointMedia(orderedWaypoints, onStageChange);
  if (!mediaResult.ok) {
    return { ok: false, stage: mediaResult.stage, error: mediaResult.error };
  }

  const durationSec = Math.floor(
    (Date.now() - session.startedAt - session.totalPausedMs) / 1000,
  );

  // Step 3: single atomic Postgres transaction via RPC
  onStageChange('saving_to_database');
  const waypointPayloads = buildWaypointPayloads(orderedWaypoints, mediaResult.mediaMap);

  const { data, error } = await supabase.rpc('save_route', {
    p_campus_id:             session.campusId,
    p_name:                  metadata.name,
    p_from_label:            session.fromLabel,
    p_to_label:              session.toLabel,
    p_start_building_id:     metadata.startBuildingId || null,
    p_end_building_id:       metadata.endBuildingId   || null,
    p_difficulty:            metadata.difficulty,
    p_tags:                  metadata.tags,
    p_recorded_duration_sec: durationSec,
    p_waypoints:             waypointPayloads,
  });

  if (error) return { ok: false, stage: 'db', error: error.message };

  return { ok: true, routeId: data as string };
}

/**
 * Publish a draft route. Callable only by admin/om_specialist (enforced at
 * both the RLS layer and inside the SECURITY DEFINER function).
 */
export async function publishRoute(routeId: string): Promise<PublishResult> {
  const { error } = await supabase.rpc('publish_route', { route_id: routeId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Retract a published route. Offline clients that cached the route will
 * receive a `retracted` status on next sync and display a warning.
 * Callable only by admin/om_specialist.
 */
export async function retractRoute(routeId: string): Promise<PublishResult> {
  const { error } = await supabase.rpc('retract_route', { route_id: routeId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
