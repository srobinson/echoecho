/**
 * ALP-950: React hook managing the voice annotation recording lifecycle.
 *
 * Orchestrates expo-speech-recognition live STT with persisted audio capture.
 * Returns state and handlers consumed by VoiceAnnotationSheet.
 *
 * Connectivity check: callers should verify network availability before
 * mounting — the hook surfaces an explicit 'offline' error state if STT
 * fails due to connectivity.
 */
import { useState, useCallback, useRef } from 'react';
import { AccessibilityInfo, Linking, Platform } from 'react-native';

import {
  startVoiceAnnotationRecording,
  stopVoiceAnnotationRecording,
  uploadVoiceAnnotation,
  type SttSubscription,
} from '../services/voiceAnnotationService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceAnnotationPhase =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'preview'
  | 'uploading'
  | 'done'
  | 'error';

export interface VoiceAnnotationState {
  phase: VoiceAnnotationPhase;
  transcript: string;
  audioUri: string | null;
  errorMessage: string | null;
  isTimeLimitReached: boolean;
  showSilencePrompt: boolean;
}

export interface VoiceAnnotationAudioSupport {
  supported: boolean;
  explanation: string | null;
}

export interface UseVoiceAnnotationReturn {
  state: VoiceAnnotationState;
  audioSupport: VoiceAnnotationAudioSupport;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  dismissSilencePrompt: () => void;
  confirm: (waypointLocalId: string) => Promise<{
    transcript: string;
    audioUri: string | null;
    uploadedKey: string | null;
  } | null>;
  discard: () => void;
  reRecord: () => void;
  openMicSettings: () => void;
}

function mergeTranscriptSegments(base: string, incoming: string): string {
  const left = base.trim();
  const right = incoming.trim();

  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;

  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();

  if (rightLower.startsWith(leftLower)) return right;
  if (leftLower.endsWith(rightLower)) return left;

  const maxOverlap = Math.min(left.length, right.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (leftLower.slice(-size) === rightLower.slice(0, size)) {
      return `${left}${right.slice(size)}`.trim();
    }
  }

  return `${left} ${right}`.trim();
}

function getVoiceAnnotationAudioSupport(): VoiceAnnotationAudioSupport {
  if (Platform.OS === 'android') {
    const sdkVersion = typeof Platform.Version === 'number'
      ? Platform.Version
      : Number.parseInt(String(Platform.Version), 10);

    if (Number.isFinite(sdkVersion) && sdkVersion < 33) {
      return {
        supported: false,
        explanation: 'This device does not support playback clips. You can still save the transcript.',
      };
    }
  }

  return { supported: true, explanation: null };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoiceAnnotation(): UseVoiceAnnotationReturn {
  const audioSupportRef = useRef<VoiceAnnotationAudioSupport>(getVoiceAnnotationAudioSupport());
  const [state, setState] = useState<VoiceAnnotationState>({
    phase: 'idle',
    transcript: '',
    audioUri: null,
    errorMessage: null,
    isTimeLimitReached: false,
    showSilencePrompt: false,
  });

  const sttSubsRef = useRef<SttSubscription[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioUriPromiseRef = useRef<Promise<string | null> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const transcriptRef = useRef('');

  const reset = useCallback((): void => {
    setState({
      phase: 'idle',
      transcript: '',
      audioUri: null,
      errorMessage: null,
      isTimeLimitReached: false,
      showSilencePrompt: false,
    });
    sttSubsRef.current = [];
    autoStopTimerRef.current = null;
    silenceTimerRef.current = null;
    audioUriPromiseRef.current = null;
    startedAtRef.current = null;
    transcriptRef.current = '';
  }, []);

  const doStop = useCallback(async (): Promise<{ audioUri: string | null }> => {
    const sttSubs = sttSubsRef.current;
    const autoStop = autoStopTimerRef.current;
    const silenceStop = silenceTimerRef.current;
    const audioUriPromise = audioUriPromiseRef.current;
    const startedAt = startedAtRef.current;

    if (!audioUriPromise || startedAt == null) return { audioUri: null };

    const { audioUri } = await stopVoiceAnnotationRecording(
      sttSubs,
      autoStop ?? setTimeout(() => {}, 0),
      silenceStop ?? setTimeout(() => {}, 0),
      audioUriPromise,
      startedAt,
    );

    sttSubsRef.current = [];
    autoStopTimerRef.current = null;
    silenceTimerRef.current = null;
    audioUriPromiseRef.current = null;
    startedAtRef.current = null;
    return { audioUri };
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setState((s) => ({
      ...s,
      phase: 'recording',
      transcript: '',
      audioUri: null,
      errorMessage: null,
      isTimeLimitReached: false,
      showSilencePrompt: false,
    }));
    transcriptRef.current = '';

    AccessibilityInfo.announceForAccessibility('Recording voice annotation');

    const result = await startVoiceAnnotationRecording({
      onAutoStop: () => {
        setState((s) => ({ ...s, isTimeLimitReached: true, phase: 'processing' }));
        void doStop().then(({ audioUri }) => {
          setState((s) => ({ ...s, phase: 'preview', audioUri }));
          AccessibilityInfo.announceForAccessibility(
            '60-second limit reached. Review your annotation.',
          );
        });
      },
      onSilenceDetected: () => {
        setState((s) => ({ ...s, showSilencePrompt: true }));
      },
      onTranscriptUpdate: (text) => {
        const nextChunk = text.trim();
        if (!nextChunk) return;

        const previewTranscript = mergeTranscriptSegments(
          transcriptRef.current,
          nextChunk,
        );
        transcriptRef.current = previewTranscript;
        setState((s) => (
          s.transcript === previewTranscript
            ? s
            : { ...s, transcript: previewTranscript }
        ));
      },
      onSTTError: (message) => {
        setState((s) => ({
          ...s,
          errorMessage: message.toLowerCase().includes('network')
            ? 'Voice annotation requires an internet connection.'
            : message,
        }));
      },
    });

    if (!result.ok) {
      const message =
        result.reason === 'permission_denied'
          ? 'Microphone permission is required for voice annotation.'
          : result.reason === 'speech_permission_denied'
            ? 'Speech recognition permission is required for transcription.'
            : result.reason === 'recognition_unavailable'
              ? 'Speech recognition is not available on this device right now.'
              : 'Failed to start voice annotation.';
      setState((s) => ({ ...s, phase: 'error', errorMessage: message }));
      return;
    }

    sttSubsRef.current = result.sttSubscriptions;
    autoStopTimerRef.current = result.autoStopTimer;
    silenceTimerRef.current = result.silenceCheckTimer;
    audioUriPromiseRef.current = result.audioUriPromise;
    startedAtRef.current = result.startedAt;
  }, [doStop]);

  const stopRecording = useCallback(async (): Promise<void> => {
    setState((s) => ({
      ...s,
      phase: 'processing',
      showSilencePrompt: false,
    }));
    const { audioUri } = await doStop();
    setState((s) => ({
      ...s,
      phase: 'preview',
      audioUri,
      transcript: transcriptRef.current,
    }));
    AccessibilityInfo.announceForAccessibility(
      'Recording stopped. Review your transcription.',
    );
  }, [doStop]);

  const dismissSilencePrompt = useCallback((): void => {
    setState((s) => ({ ...s, showSilencePrompt: false }));
  }, []);

  /**
   * Confirm the transcription and queue the audio upload.
   * Returns the transcript and resolved storage key (null if upload failed and was queued).
   */
  const confirm = useCallback(
    async (
      waypointLocalId: string,
    ): Promise<{
      transcript: string;
      audioUri: string | null;
      uploadedKey: string | null;
    } | null> => {
      if (state.phase !== 'preview') return null;

      setState((s) => ({ ...s, phase: 'uploading' }));

      const transcript = state.transcript;
      const audioUri = state.audioUri;
      let uploadedKey: string | null = null;

      if (audioUri) {
        const uploadResult = await uploadVoiceAnnotation(audioUri, waypointLocalId);
        uploadedKey = uploadResult.ok ? uploadResult.storageKey : null;
      }

      setState((s) => ({ ...s, phase: 'done' }));
      AccessibilityInfo.announceForAccessibility('Voice annotation saved.');

      return { transcript, audioUri, uploadedKey };
    },
    [state.phase, state.transcript, state.audioUri],
  );

  const discard = useCallback((): void => {
    if (state.phase === 'recording') {
      void doStop();
    }
    reset();
  }, [state.phase, doStop, reset]);

  const reRecord = useCallback((): void => {
    const doReRecord = async () => {
      if (state.phase === 'recording') {
        await doStop();
      }
      reset();
      await startRecording();
    };
    void doReRecord();
  }, [state.phase, doStop, reset, startRecording]);

  const openMicSettings = useCallback((): void => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  return {
    state,
    audioSupport: audioSupportRef.current,
    startRecording,
    stopRecording,
    dismissSilencePrompt,
    confirm,
    discard,
    reRecord,
    openMicSettings,
  };
}
