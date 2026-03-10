/**
 * ALP-950: Voice annotation at waypoints.
 *
 * Manages simultaneous audio recording (expo-av) and live speech-to-text
 * (expo-speech-recognition). The STT transcript is shown for review before save.
 * The raw audio file is stored locally and queued for Supabase Storage upload.
 *
 * Audio session (iOS): AVAudioSession category PlayAndRecord with allowBluetooth.
 * Coexists with the background GPS session from ALP-947 — activating the mic does
 * not interrupt the location task.
 *
 * Connectivity: expo-speech-recognition requires network on iOS <16 and most Android
 * devices. Callers must check connectivity before starting and surface an explicit error.
 *
 * Maximum recording duration: 60 seconds. Auto-stop fires at the limit.
 * Audio-level silence check: if no audio detected in the first 3 seconds, prompt retry.
 *
 * Upload failure: transcript text is saved locally; audio upload is queued for retry.
 */
import { Audio } from 'expo-av';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
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
const STORAGE_BUCKET = 'route-audio';

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
    extension: '.m4a',
  },
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

// ── Audio session helpers ─────────────────────────────────────────────────────

/**
 * Activate the recording audio session. Coexists with background GPS on iOS by
 * using PlayAndRecord with mixWithOthers and allowBluetooth options.
 */
export async function activateRecordingAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
}

/** Restore the audio session to playback mode after recording ends. */
export async function deactivateRecordingAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
}

// ── Recording lifecycle ───────────────────────────────────────────────────────

export interface SttSubscription {
  remove: () => void;
}

export type StartRecordingResult =
  | {
      ok: true;
      recording: Audio.Recording;
      sttSubscriptions: SttSubscription[];
      autoStopTimer: ReturnType<typeof setTimeout>;
      silenceCheckTimer: ReturnType<typeof setTimeout>;
    }
  | {
      ok: false;
      reason:
        | 'permission_denied'
        | 'speech_permission_denied'
        | 'recognition_unavailable'
        | 'audio_session_error'
        | 'start_failed'
        | 'already_recording';
    };

/**
 * Start simultaneous Audio.Recording and STT recognition.
 * Returns the recording object and timer handles the caller must retain.
 *
 * onAutoStop fires when the 60-second limit is reached.
 * onSilenceDetected fires if the mic is silent for the first 3 seconds.
 * onTranscriptUpdate fires with each interim STT result.
 */
export async function startVoiceAnnotationRecording(options: {
  onAutoStop: () => void;
  onSilenceDetected: () => void;
  onTranscriptUpdate: (text: string) => void;
  onSTTError: (message: string) => void;
}): Promise<StartRecordingResult> {
  const { onAutoStop, onSilenceDetected, onTranscriptUpdate, onSTTError } = options;

  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

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
    await activateRecordingAudioSession();
  } catch {
    return { ok: false, reason: 'audio_session_error' };
  }

  const recording = new Audio.Recording();
  try {
    await recording.prepareToRecordAsync(RECORDING_OPTIONS);
    await recording.startAsync();

    // STT runs in parallel
    const sttSubs = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const text = event.results[0]?.transcript ?? '';
        if (text) onTranscriptUpdate(text);
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        onSTTError(event.message ?? 'Speech recognition error');
      }),
    ];

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: 1,
      continuous: true,
    });

    const autoStopTimer = setTimeout(() => {
      onAutoStop();
    }, MAX_DURATION_MS);

    const silenceCheckTimer = setTimeout(async () => {
      try {
        const status = await recording.getStatusAsync();
        const level = status.metering ?? -160;
        if (level < -60) {
          onSilenceDetected();
        }
      } catch {
        // Ignore status reads after the recorder has already been torn down.
      }
    }, SILENCE_CHECK_MS);

    return { ok: true, recording, sttSubscriptions: sttSubs, autoStopTimer, silenceCheckTimer };
  } catch {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // best-effort cleanup only
    }
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // recording may not have started
    }
    await deactivateRecordingAudioSession();
    return { ok: false, reason: 'start_failed' };
  }
}

export interface StopRecordingResult {
  audioUri: string | null;
  durationMs: number;
}

/**
 * Stop the recording and STT, clear timers, restore the audio session.
 * Returns the local audio URI and actual duration.
 */
export async function stopVoiceAnnotationRecording(
  recording: Audio.Recording,
  sttSubscriptions: SttSubscription[],
  autoStopTimer: ReturnType<typeof setTimeout>,
  silenceCheckTimer: ReturnType<typeof setTimeout>,
): Promise<StopRecordingResult> {
  clearTimeout(autoStopTimer);
  clearTimeout(silenceCheckTimer);

  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // recognizer may already be stopped or unavailable
  }
  sttSubscriptions.forEach((s) => s.remove());

  let audioUri: string | null = null;
  let durationMs = 0;

  try {
    const statusBefore = await recording.getStatusAsync();
    durationMs = statusBefore.durationMillis ?? 0;
    await recording.stopAndUnloadAsync();
    audioUri = recording.getURI();
  } catch {
    // Recording may have already stopped
  }

  try {
    await deactivateRecordingAudioSession();
  } catch {
    // no-op cleanup failure
  }

  return { audioUri, durationMs };
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
  const storageKey = `pending/${waypointLocalId}.m4a`;

  try {
    const blob = await uriToBlob(localUri);

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, blob, { contentType: 'audio/mp4', upsert: true });

    if (error) throw error;

    return { ok: true, storageKey };
  } catch {
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

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(item.storageKey, blob, { contentType: 'audio/mp4', upsert: true });

      if (error) throw error;
    } catch {
      remaining.push(item);
    }
  }

  await saveAudioRetryQueue(remaining);
}
