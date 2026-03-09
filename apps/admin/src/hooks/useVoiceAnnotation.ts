/**
 * ALP-950: React hook managing the voice annotation recording lifecycle.
 *
 * Orchestrates expo-av audio recording + expo-speech-recognition STT.
 * Returns state and handlers consumed by VoiceAnnotationSheet.
 *
 * Connectivity check: callers should verify network availability before
 * mounting — the hook surfaces an explicit 'offline' error state if STT
 * fails due to connectivity.
 */
import { useState, useCallback, useRef } from 'react';
import { AccessibilityInfo, Linking, Platform } from 'react-native';
import { Audio } from 'expo-av';

import {
  startVoiceAnnotationRecording,
  stopVoiceAnnotationRecording,
  uploadVoiceAnnotation,
} from '../services/voiceAnnotationService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceAnnotationPhase =
  | 'idle'
  | 'recording'
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

export interface UseVoiceAnnotationReturn {
  state: VoiceAnnotationState;
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoiceAnnotation(): UseVoiceAnnotationReturn {
  const [state, setState] = useState<VoiceAnnotationState>({
    phase: 'idle',
    transcript: '',
    audioUri: null,
    errorMessage: null,
    isTimeLimitReached: false,
    showSilencePrompt: false,
  });

  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback((): void => {
    setState({
      phase: 'idle',
      transcript: '',
      audioUri: null,
      errorMessage: null,
      isTimeLimitReached: false,
      showSilencePrompt: false,
    });
    recordingRef.current = null;
    autoStopTimerRef.current = null;
    silenceTimerRef.current = null;
  }, []);

  const doStop = useCallback(async (): Promise<{ audioUri: string | null }> => {
    const recording = recordingRef.current;
    const autoStop = autoStopTimerRef.current;
    const silenceStop = silenceTimerRef.current;

    if (!recording) return { audioUri: null };

    const { audioUri } = await stopVoiceAnnotationRecording(
      recording,
      autoStop ?? setTimeout(() => {}, 0),
      silenceStop ?? setTimeout(() => {}, 0),
    );

    recordingRef.current = null;
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

    AccessibilityInfo.announceForAccessibility('Recording voice annotation');

    const result = await startVoiceAnnotationRecording({
      onAutoStop: () => {
        setState((s) => ({ ...s, isTimeLimitReached: true }));
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
        setState((s) => ({ ...s, transcript: text }));
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
          : 'Failed to start audio recording.';
      setState((s) => ({ ...s, phase: 'error', errorMessage: message }));
      return;
    }

    recordingRef.current = result.recording;
    autoStopTimerRef.current = result.autoStopTimer;
    silenceTimerRef.current = result.silenceCheckTimer;
  }, [doStop]);

  const stopRecording = useCallback(async (): Promise<void> => {
    const { audioUri } = await doStop();
    setState((s) => ({ ...s, phase: 'preview', audioUri }));
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

      const { transcript, audioUri } = state;
      let uploadedKey: string | null = null;

      if (audioUri) {
        const uploadResult = await uploadVoiceAnnotation(audioUri, waypointLocalId);
        uploadedKey = uploadResult.ok ? uploadResult.storageKey : null;
      }

      setState((s) => ({ ...s, phase: 'done' }));
      AccessibilityInfo.announceForAccessibility('Voice annotation saved.');

      return { transcript, audioUri, uploadedKey };
    },
    [state],
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
    startRecording,
    stopRecording,
    dismissSilencePrompt,
    confirm,
    discard,
    reRecord,
    openMicSettings,
  };
}
