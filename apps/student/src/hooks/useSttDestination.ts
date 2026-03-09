/**
 * Voice destination input via STT (ALP-954).
 *
 * Implements the DestinationEntry voice state machine from student-nav-ui-specs.md:
 *   idle → listening → transcribing → destination_confirmed
 *
 * This hook owns the SttSessionState contract consumed by ALP-958. The haptic
 * engine calls requestPause() before firing a turn cue to prevent iOS Taptic
 * Engine suppression during active dictation.
 *
 * Connectivity: expo-speech-recognition requires network on iOS < 16 and most
 * Android devices. When unavailable (offline or permission denied), callers
 * receive sttUnavailable=true and should surface the keyboard fallback.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AccessibilityInfo,
  Platform,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { SttSessionState } from '@echoecho/shared';
import { fuzzySearch, type FuseMatch } from '../lib/buildingIndex';

// ── Constants ───────────────────────────────────────────────────────────────

const NO_SPEECH_TIMEOUT_MS = 8_000;
const CONFIRMATION_TIMEOUT_MS = 5_000;
/** Fuse score delta within which two results are considered ambiguous. */
const AMBIGUITY_SCORE_DELTA = 0.1;

// ── Types ───────────────────────────────────────────────────────────────────

export type SttState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'confirming'
  | 'disambiguating'
  | 'error';

export interface DestinationMatch {
  buildingId: string;
  name: string;
}

export interface UseSttDestinationResult {
  sttState: SttState;
  transcript: string | null;
  matches: DestinationMatch[];
  /** The single confirmed match awaiting user confirmation. */
  pendingMatch: DestinationMatch | null;
  error: string | null;
  /** True when STT is unavailable (offline, permission denied). */
  sttUnavailable: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  confirmDestination: () => void;
  rejectDestination: () => void;
  resetToIdle: () => void;
  /** Implement SttSessionState for ALP-958 consumption. */
  sttSessionState: SttSessionState;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSttDestination(
  onDestinationSelected: (buildingId: string, name: string) => void
): UseSttDestinationResult {
  const [sttState, setSttState] = useState<SttState>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [matches, setMatches] = useState<DestinationMatch[]>([]);
  const [pendingMatch, setPendingMatch] = useState<DestinationMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sttUnavailable, setSttUnavailable] = useState(false);

  // ALP-958 STT mutex state
  const isPausedRef = useRef(false);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  const wasActiveBeforePauseRef = useRef(false);

  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  // ── STT event handlers ─────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results.length === 0) return;
    const text = event.results[0].transcript ?? '';
    setTranscript(text);
    clearTimers();
    processTranscript(text);
  });

  useSpeechRecognitionEvent('error', (event) => {
    clearTimers();
    if (event.error === 'no-speech') {
      AccessibilityInfo.announceForAccessibility('No speech detected.');
      resetToIdle();
    } else {
      setError(`Recognition error: ${event.message}`);
      setSttState('error');
    }
    isPausedRef.current = false;
    pauseResolverRef.current?.();
    pauseResolverRef.current = null;
  });

  useSpeechRecognitionEvent('end', () => {
    isPausedRef.current = false;
    pauseResolverRef.current?.();
    pauseResolverRef.current = null;
  });

  // ── Match processing ───────────────────────────────────────────────────

  const processTranscript = useCallback((text: string) => {
    setSttState('transcribing');
    const results = fuzzySearch(text);

    if (results.length === 0) {
      setError(`No destination found for "${text}". Try again or spell it out.`);
      AccessibilityInfo.announceForAccessibility(
        `No destination found for ${text}. Try again or spell it out.`
      );
      setSttState('error');
      return;
    }

    const best = results[0];
    const ambiguous = results.filter(
      (r: FuseMatch) => (r.score - best.score) <= AMBIGUITY_SCORE_DELTA
    );

    if (ambiguous.length > 1) {
      const topTwo = ambiguous.slice(0, 2).map(
        (r: FuseMatch) => ({ buildingId: r.item.id, name: r.item.name })
      );
      setMatches(topTwo);
      setSttState('disambiguating');
      const names = topTwo.map((m) => m.name).join(' or ');
      AccessibilityInfo.announceForAccessibility(`Did you mean: ${names}?`);
    } else {
      const match = { buildingId: best.item.id, name: best.item.name };
      setPendingMatch(match);
      setSttState('confirming');
      AccessibilityInfo.announceForAccessibility(
        `Navigate to ${match.name}?`
      );

      confirmTimerRef.current = setTimeout(() => {
        AccessibilityInfo.announceForAccessibility('Cancelled.');
        resetToIdle();
      }, CONFIRMATION_TIMEOUT_MS);
    }
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript(null);
    setMatches([]);
    setPendingMatch(null);

    const permResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permResult.granted) {
      setSttUnavailable(true);
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
      });
      setSttState('listening');
      AccessibilityInfo.announceForAccessibility('Listening. Speak your destination.');

      noSpeechTimerRef.current = setTimeout(() => {
        AccessibilityInfo.announceForAccessibility('No speech detected.');
        ExpoSpeechRecognitionModule.abort();
        resetToIdle();
      }, NO_SPEECH_TIMEOUT_MS);
    } catch {
      setSttUnavailable(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    clearTimers();
    ExpoSpeechRecognitionModule.stop();
  }, [clearTimers]);

  const confirmDestination = useCallback(() => {
    clearTimers();
    if (pendingMatch) {
      onDestinationSelected(pendingMatch.buildingId, pendingMatch.name);
      resetToIdle();
    }
  }, [pendingMatch, onDestinationSelected, clearTimers]);

  const rejectDestination = useCallback(() => {
    clearTimers();
    setPendingMatch(null);
    setSttState('listening');
    void startListening();
  }, [startListening, clearTimers]);

  const resetToIdle = useCallback(() => {
    clearTimers();
    setSttState('idle');
    setTranscript(null);
    setMatches([]);
    setPendingMatch(null);
    setError(null);
  }, [clearTimers]);

  // ── SttSessionState (ALP-958 contract) ────────────────────────────────

  const sttSessionState: SttSessionState = {
    get isActive() {
      return sttState === 'listening';
    },
    requestPause: async () => {
      if (sttState !== 'listening') return;
      wasActiveBeforePauseRef.current = true;
      isPausedRef.current = false;
      ExpoSpeechRecognitionModule.stop();
      // Wait for the 'end' event to confirm stop (up to 200ms per ALP-976 spec).
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          isPausedRef.current = true;
          resolve();
        }, 200);
        pauseResolverRef.current = () => {
          clearTimeout(timeout);
          isPausedRef.current = true;
          resolve();
        };
      });
    },
    confirmPaused: () => isPausedRef.current,
    resume: () => {
      if (!wasActiveBeforePauseRef.current) return;
      wasActiveBeforePauseRef.current = false;
      isPausedRef.current = false;
      // Re-open the mic. A new no-speech timeout begins.
      void startListening();
    },
  };

  // iOS: request permissions eagerly on mount so the permission prompt does
  // not surprise the user mid-dictation on their first tap.
  useEffect(() => {
    if (Platform.OS === 'ios') {
      void ExpoSpeechRecognitionModule.requestPermissionsAsync().then((r) => {
        if (!r.granted) setSttUnavailable(true);
      });
    }
  }, []);

  return {
    sttState,
    transcript,
    matches,
    pendingMatch,
    error,
    sttUnavailable,
    startListening,
    stopListening,
    confirmDestination,
    rejectDestination,
    resetToIdle,
    sttSessionState,
  };
}
