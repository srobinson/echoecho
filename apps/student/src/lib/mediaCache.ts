/**
 * Media caching for offline navigation (ALP-963).
 *
 * Downloads audio annotations to the local filesystem so the navigation loop
 * runs without network access. Individual download failures fall back to TTS
 * on `annotation_text`.
 *
 * The route-audio bucket is private, so annotation_audio_url stores a storage
 * key rather than a direct URL. We generate signed URLs at download time via
 * createSignedUrl() to obtain time-limited access.
 */

import * as FileSystem from 'expo-file-system';
import { setWaypointAudioPath } from './localDb';
import { supabase } from './supabase';

const AUDIO_BUCKET = 'route-audio';
const SIGNED_URL_TTL_SECONDS = 3600;

export interface ServerWaypoint {
  id: string;
  annotation_audio_url: string | null;
  annotation_text: string | null;
}

/**
 * Downloads audio annotations for all waypoints in a route.
 *
 * Skips waypoints that already have a cached file (idempotent).
 * On download failure the waypoint's local path stays null; the navigation
 * loop uses `annotation_text` + TTS as a fallback.
 */
export async function cacheRouteMedia(
  routeId: string,
  waypoints: ServerWaypoint[]
): Promise<void> {
  const dir = `${FileSystem.documentDirectory}routes/${routeId}/`;

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  for (const wp of waypoints) {
    if (!wp.annotation_audio_url) continue;

    const localPath = `${dir}${wp.id}_audio.m4a`;

    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      await setWaypointAudioPath(wp.id, localPath);
      continue;
    }

    try {
      const storageKey = wp.annotation_audio_url;
      let downloadUrl: string;

      if (storageKey.startsWith('http')) {
        // Legacy: direct URL (pre-fix data). Use as-is.
        downloadUrl = storageKey;
      } else {
        // Storage key: generate a signed URL for the private bucket.
        const { data: signed, error: signError } = await supabase.storage
          .from(AUDIO_BUCKET)
          .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS);
        if (signError || !signed?.signedUrl) {
          console.warn(`[mediaCache] Failed to sign URL for waypoint ${wp.id}:`, signError?.message);
          await setWaypointAudioPath(wp.id, null);
          continue;
        }
        downloadUrl = signed.signedUrl;
      }

      await FileSystem.downloadAsync(downloadUrl, localPath);
      await setWaypointAudioPath(wp.id, localPath);
    } catch (err) {
      console.warn(
        `[mediaCache] Failed to download audio for waypoint ${wp.id}:`,
        err
      );
      await setWaypointAudioPath(wp.id, null);
    }
  }
}
