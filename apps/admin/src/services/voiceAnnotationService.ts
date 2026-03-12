/**
 * ALP-950: Voice annotation at waypoints.
 *
 * Manages live speech-to-text and persisted audio capture through
 * expo-speech-recognition. The STT transcript is shown for review before save,
 * and the recognizer itself persists the raw audio to a local file.
 *
 * Connectivity: expo-speech-recognition requires network on iOS <16 and most Android
 * devices. Callers must check connectivity before starting and surface an explicit error.
 *
 * Maximum recording duration: 60 seconds. Auto-stop fires at the limit.
 * Silence check: if no audible input is detected in the first 3 seconds, prompt retry.
 *
 * Upload failure: transcript text is saved locally; audio upload is queued for retry.
 */
import {
  ExpoSpeechRecognitionModule,
} from 'expo-speech-recognition';
import * as FileSystem from 'expo-file-system';

import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceAnnotationStatus =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'preview'
  | 'uploading'
  | 'done'
  | 'error';

export interface VoiceAnnotationSession {
  status: VoiceAnnotationStatus;
  transcript: string;
  audioUri: string | null;
  errorMessage: string | null;
}

export type AudioUploadResult =
  | { ok: true; storageKey: string }
  | { ok: false; queued: boolean; localUri: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_DURATION_MS = 60_000;
const SILENCE_CHECK_MS = 3_000;
const AUDIO_URI_WAIT_MS = 5_000;
const AUDIO_UPLOAD_TIMEOUT_MS = 15_000;
const STORAGE_BUCKET = 'route-audio';

// ── Recording lifecycle ───────────────────────────────────────────────────────

export interface SttSubscription {
  remove: () => void;
}

export type StartRecordingResult =
  | {
      ok: true;
      sttSubscriptions: SttSubscription[];
      autoStopTimer: ReturnType<typeof setTimeout>;
      silenceCheckTimer: ReturnType<typeof setTimeout>;
      audioUriPromise: Promise<string | null>;
      startedAt: number;
    }
  | {
      ok: false;
      reason:
        | 'permission_denied'
        | 'speech_permission_denied'
        | 'recognition_unavailable'
        | 'start_failed'
        | 'already_recording';
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRecognizerPackageName(): string | null {
  try {
    return ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName || null;
  } catch {
    return null;
  }
}

async function verifyPersistedAudioFile(uri: string | null): Promise<string | null> {
  if (!uri) return null;

  const deadline = Date.now() + AUDIO_URI_WAIT_MS;
  let lastSize = -1;
  let stableCount = 0;

  while (Date.now() < deadline) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists && typeof info.size === 'number' ? info.size : 0;

      console.log('[voice-annotation] verify-file', JSON.stringify({
        uri,
        exists: info.exists,
        isDirectory: info.isDirectory,
        size,
      }));

      if (info.exists && !info.isDirectory && size > 0) {
        stableCount = size === lastSize ? stableCount + 1 : 0;
        lastSize = size;

        if (stableCount >= 1) {
          return uri;
        }
      }
    } catch (error) {
      console.warn('[voice-annotation] verify-file-error', error);
    }

    await sleep(250);
  }

  return null;
}

/**
 * Start speech recognition with persisted audio capture.
 * Returns the timer handles and audio promise the caller must retain.
 *
 * onAutoStop fires when the 60-second limit is reached.
 * onSilenceDetected fires if no audible input is detected for the first 3 seconds.
 * onTranscriptUpdate fires with each interim STT result.
 */
export async function startVoiceAnnotationRecording(options: {
  onAutoStop: () => void;
  onSilenceDetected: () => void;
  onTranscriptUpdate: (text: string, isFinal: boolean) => void;
  onSTTError: (message: string) => void;
}): Promise<StartRecordingResult> {
  const { onAutoStop, onSilenceDetected, onTranscriptUpdate, onSTTError } = options;

  try {
    const speechPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!speechPermission.granted) {
      return { ok: false, reason: 'speech_permission_denied' };
    }
  } catch {
    return { ok: false, reason: 'speech_permission_denied' };
  }

  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
    return { ok: false, reason: 'recognition_unavailable' };
  }

  try {
    let heardAudibleInput = false;
    let hasResolvedAudioUri = false;
    let candidateAudioUri: string | null = null;
    let resolveAudioUri: (uri: string | null) => void = () => {};
    const audioUriPromise = new Promise<string | null>((resolve) => {
      resolveAudioUri = resolve;
    });
    const recognizerPackage = getRecognizerPackageName();

    console.log('[voice-annotation] start', JSON.stringify({
      recognizerPackage,
      persist: true,
    }));

    const finalizeAudioUri = (uri: string | null) => {
      if (hasResolvedAudioUri) return;
      hasResolvedAudioUri = true;
      resolveAudioUri(uri);
    };

    const sttSubs = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const text = event.results[0]?.transcript ?? '';
        if (event.isFinal) {
          console.log('[voice-annotation] result-final', JSON.stringify({
            recognizerPackage,
            transcriptLength: text.length,
          }));
        }
        if (text) onTranscriptUpdate(text, event.isFinal);
      }),
      ExpoSpeechRecognitionModule.addListener('audiostart', (event) => {
        candidateAudioUri = event.uri ?? null;
        console.log('[voice-annotation] audiostart', JSON.stringify({
          recognizerPackage,
          uri: candidateAudioUri,
        }));
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        console.warn('[voice-annotation] error', JSON.stringify({
          recognizerPackage,
          message: event.message ?? 'Speech recognition error',
        }));
        onSTTError(event.message ?? 'Speech recognition error');
      }),
      ExpoSpeechRecognitionModule.addListener('audioend', (event) => {
        candidateAudioUri = event.uri ?? candidateAudioUri;
        console.log('[voice-annotation] audioend', JSON.stringify({
          recognizerPackage,
          uri: event.uri ?? null,
          candidateAudioUri,
        }));
        finalizeAudioUri(event.uri ?? null);
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        console.log('[voice-annotation] end', JSON.stringify({
          recognizerPackage,
          candidateAudioUri,
          hasResolvedAudioUri,
        }));
        if (!hasResolvedAudioUri && candidateAudioUri) {
          finalizeAudioUri(candidateAudioUri);
        }
      }),
      ExpoSpeechRecognitionModule.addListener('volumechange', (event) => {
        if (event.value >= 0) {
          heardAudibleInput = true;
        }
      }),
    ];

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: 1,
      continuous: true,
      recordingOptions: {
        persist: true,
      },
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 250,
      },
      androidRecognitionServicePackage:
        recognizerPackage ?? undefined,
    });

    const autoStopTimer = setTimeout(() => {
      onAutoStop();
    }, MAX_DURATION_MS);

    const silenceCheckTimer = setTimeout(() => {
      if (!heardAudibleInput) {
        onSilenceDetected();
      }
    }, SILENCE_CHECK_MS);

    return {
      ok: true,
      sttSubscriptions: sttSubs,
      autoStopTimer,
      silenceCheckTimer,
      audioUriPromise,
      startedAt: Date.now(),
    };
  } catch {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // best-effort cleanup only
    }
    return { ok: false, reason: 'start_failed' };
  }
}

export interface StopRecordingResult {
  audioUri: string | null;
  durationMs: number;
}

/**
 * Stop speech recognition, clear timers, and wait for the persisted audio file.
 * Returns the local audio URI and actual duration.
 */
export async function stopVoiceAnnotationRecording(
  sttSubscriptions: SttSubscription[],
  autoStopTimer: ReturnType<typeof setTimeout>,
  silenceCheckTimer: ReturnType<typeof setTimeout>,
  audioUriPromise: Promise<string | null>,
  startedAt: number,
): Promise<StopRecordingResult> {
  clearTimeout(autoStopTimer);
  clearTimeout(silenceCheckTimer);

  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // recognizer may already be stopped or unavailable
  }

  try {
    const rawAudioUri = await Promise.race<string | null>([
      audioUriPromise,
      new Promise<string | null>((resolve) => {
        setTimeout(() => resolve(null), AUDIO_URI_WAIT_MS);
      }),
    ]);
    const audioUri = await verifyPersistedAudioFile(rawAudioUri);
    sttSubscriptions.forEach((s) => s.remove());
    console.log('[voice-annotation] stop-complete', JSON.stringify({
      rawAudioUri,
      verifiedAudioUri: audioUri,
    }));
    return {
      audioUri,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  } catch {
    sttSubscriptions.forEach((s) => s.remove());
    return {
      audioUri: null,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

/** Convert a local file URI to a Blob via fetch, avoiding base64 materialization in JS heap. */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

const RETRY_QUEUE_PATH = `${FileSystem.documentDirectory}audio-upload-queue.json`;

interface AudioRetryItem {
  localUri: string;
  waypointLocalId: string;
  storageKey: string;
  queuedAt: number;
}

async function loadAudioRetryQueue(): Promise<AudioRetryItem[]> {
  try {
    const info = await FileSystem.getInfoAsync(RETRY_QUEUE_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(RETRY_QUEUE_PATH);
    return JSON.parse(raw) as AudioRetryItem[];
  } catch {
    return [];
  }
}

async function saveAudioRetryQueue(items: AudioRetryItem[]): Promise<void> {
  await FileSystem.writeAsStringAsync(RETRY_QUEUE_PATH, JSON.stringify(items));
}

async function enqueueAudioRetry(item: AudioRetryItem): Promise<void> {
  const queue = await loadAudioRetryQueue();
  await saveAudioRetryQueue([...queue, item]);
}

/**
 * Upload a voice annotation audio file to Supabase Storage.
 * On failure, queues the upload and returns ok:false with queued:true.
 * The transcript text annotation is always saved by the caller regardless of upload status.
 */
export async function uploadVoiceAnnotation(
  localUri: string,
  waypointLocalId: string,
): Promise<AudioUploadResult> {
  const { storageKey, contentType } = getAudioUploadTarget(localUri, waypointLocalId);

  try {
    console.log('[voice-annotation] upload-start', JSON.stringify({
      localUri,
      waypointLocalId,
      storageKey,
      contentType,
    }));
    const uploadTask = (async () => {
      const blob = await uriToBlob(localUri);
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storageKey, blob, { contentType, upsert: true });

      if (error) throw error;
    })();

    await Promise.race([
      uploadTask,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Audio upload timed out')), AUDIO_UPLOAD_TIMEOUT_MS);
      }),
    ]);

    console.log('[voice-annotation] upload-success', JSON.stringify({
      waypointLocalId,
      storageKey,
    }));
    return { ok: true, storageKey };
  } catch (error) {
    console.warn('[voice-annotation] upload-failed', JSON.stringify({
      waypointLocalId,
      storageKey,
      error: error instanceof Error ? error.message : String(error),
    }));
    await enqueueAudioRetry({ localUri, waypointLocalId, storageKey, queuedAt: Date.now() });
    return { ok: false, queued: true, localUri };
  }
}

/** Retry all queued audio uploads. Call on app foreground. */
export async function processAudioUploadRetryQueue(): Promise<void> {
  const queue = await loadAudioRetryQueue();
  if (queue.length === 0) return;

  const remaining: AudioRetryItem[] = [];

  for (const item of queue) {
    try {
      const blob = await uriToBlob(item.localUri);
      const { contentType } = getAudioUploadTarget(item.localUri, item.waypointLocalId);

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(item.storageKey, blob, { contentType, upsert: true });

      if (error) throw error;
    } catch {
      remaining.push(item);
    }
  }

  await saveAudioRetryQueue(remaining);
}

function getAudioUploadTarget(localUri: string, waypointLocalId: string): {
  storageKey: string;
  contentType: string;
} {
  const extensionMatch = localUri.match(/\.([a-z0-9]+)(?:\?|$)/i);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? 'm4a';
  const contentType =
    extension === 'wav'
      ? 'audio/wav'
      : extension === 'caf'
        ? 'audio/x-caf'
        : extension === 'webm'
          ? 'audio/webm'
          : 'audio/mp4';

  return {
    storageKey: `pending/${waypointLocalId}.${extension}`,
    contentType,
  };
}
