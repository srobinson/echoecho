/**
 * ALP-951: Photo snapshot at waypoints (admin only).
 *
 * Uses expo-image-picker (launchCameraAsync) + expo-image-manipulator for
 * JPEG quality 0.7, max 1024px on the long edge.
 *
 * Upload failure handling: the local copy is retained in expo-file-system and
 * queued in a JSON retry manifest. Call processUploadRetryQueue() on app
 * foreground to drain pending uploads.
 *
 * The photo is never surfaced to the student navigation app; RLS on the
 * route-photos bucket enforces this at the Supabase layer.
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Linking, Platform } from 'react-native';

import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CapturedPhoto {
  /** Local URI immediately available for thumbnail display. */
  localUri: string;
  /** Width in pixels after manipulation. */
  width: number;
  /** Height in pixels after manipulation. */
  height: number;
}

export type PhotoCaptureResult =
  | { ok: true; photo: CapturedPhoto }
  | { ok: false; reason: 'cancelled' | 'permission_denied' | 'error'; message?: string };

export type PhotoUploadResult =
  | { ok: true; storageKey: string }
  | { ok: false; queued: boolean; localUri: string };

interface RetryItem {
  localUri: string;
  waypointLocalId: string;
  storageKey: string;
  queuedAt: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHOTO_MAX_DIMENSION = 1024;
const PHOTO_QUALITY = 0.7;
const RETRY_QUEUE_PATH = `${FileSystem.documentDirectory}photo-upload-queue.json`;
const STORAGE_BUCKET = 'route-photos';

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestCameraPermission(): Promise<
  { granted: true } | { granted: false; canAskAgain: boolean }
> {
  const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted' ? { granted: true } : { granted: false, canAskAgain };
}

export function openCameraSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}

// ── Capture ───────────────────────────────────────────────────────────────────

/**
 * Launch the system camera and return a locally-stored, compressed photo.
 * Thumbnail display should begin from the returned localUri immediately; do not
 * wait for the upload before showing feedback.
 */
export async function captureWaypointPhoto(): Promise<PhotoCaptureResult> {
  const permission = await requestCameraPermission();
  if (!permission.granted) {
    return { ok: false, reason: 'permission_denied' };
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      // Apply quality compression; expo-image-manipulator handles dimension capping below.
      quality: PHOTO_QUALITY,
      exif: false,
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.canceled) {
    return { ok: false, reason: 'cancelled' };
  }

  const asset = result.assets[0];

  // Resize to max 1024px on the long edge while preserving aspect ratio.
  const longEdge = Math.max(asset.width, asset.height);
  const resizeAction: ImageManipulator.Action =
    longEdge > PHOTO_MAX_DIMENSION
      ? asset.width >= asset.height
        ? { resize: { width: PHOTO_MAX_DIMENSION } }
        : { resize: { height: PHOTO_MAX_DIMENSION } }
      : { resize: { width: asset.width } }; // no-op resize preserves file

  let manipulated: ImageManipulator.ImageResult;
  try {
    manipulated = await ImageManipulator.manipulateAsync(asset.uri, [resizeAction], {
      compress: PHOTO_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
  } catch {
    // Manipulation failed; fall back to the unmanipulated asset URI.
    return {
      ok: true,
      photo: { localUri: asset.uri, width: asset.width, height: asset.height },
    };
  }

  return {
    ok: true,
    photo: {
      localUri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
    },
  };
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Upload a captured photo to Supabase Storage.
 * On failure, queues the upload for retry and returns ok:false with queued:true.
 */
export async function uploadWaypointPhoto(
  localUri: string,
  waypointLocalId: string,
): Promise<PhotoUploadResult> {
  const storageKey = `pending/${waypointLocalId}.jpg`;

  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storageKey, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    if (error) throw error;

    return { ok: true, storageKey };
  } catch {
    // Retain local file and queue retry
    await enqueueRetry({ localUri, waypointLocalId, storageKey, queuedAt: Date.now() });
    return { ok: false, queued: true, localUri };
  }
}

// ── Retry queue ───────────────────────────────────────────────────────────────

async function loadRetryQueue(): Promise<RetryItem[]> {
  try {
    const info = await FileSystem.getInfoAsync(RETRY_QUEUE_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(RETRY_QUEUE_PATH);
    return JSON.parse(raw) as RetryItem[];
  } catch {
    return [];
  }
}

async function saveRetryQueue(items: RetryItem[]): Promise<void> {
  await FileSystem.writeAsStringAsync(RETRY_QUEUE_PATH, JSON.stringify(items));
}

async function enqueueRetry(item: RetryItem): Promise<void> {
  const queue = await loadRetryQueue();
  await saveRetryQueue([...queue, item]);
}

/**
 * Attempt to upload all queued photos. Call on app foreground (AppState 'active').
 * Successfully uploaded items are removed from the queue.
 */
export async function processUploadRetryQueue(): Promise<void> {
  const queue = await loadRetryQueue();
  if (queue.length === 0) return;

  const remaining: RetryItem[] = [];

  for (const item of queue) {
    try {
      const base64 = await FileSystem.readAsStringAsync(item.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(item.storageKey, bytes, { contentType: 'image/jpeg', upsert: true });

      if (error) throw error;
      // Success — do not add back to remaining
    } catch {
      remaining.push(item);
    }
  }

  await saveRetryQueue(remaining);
}
