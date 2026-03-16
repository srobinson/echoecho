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
import { AccessibilityInfo } from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import type { SttSessionState } from '@echoecho/shared';
import { fuzzySearch, type FuseMatch } from '../lib/buildingIndex';

// ── Constants ───────────────────────────────────────────────────────────────

const NO_SPEECH_TIMEOUT_MS = 8_000;
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
  /** The most recent single match, shown briefly as visual assistance. */
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
  onDestinationSelected: (buildingId: string, name: string) => void,
  campusId?: string,
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

  // ── State reset (used by event handlers and public API) ──────────────

  const resetToIdle = useCallback(() => {
    clearTimers();
    setSttState('idle');
    setTranscript(null);
    setMatches([]);
    setPendingMatch(null);
    setError(null);
  }, [clearTimers]);

  const confirmMatch = useCallback(
    (match: DestinationMatch) => {
      setPendingMatch(match);
      setMatches([]);
      setSttState('confirming');
      Speech.stop();
      Speech.speak(`Destination matched. Starting navigation to ${match.name}.`);
      AccessibilityInfo.announceForAccessibility(
        `Destination matched. Starting navigation to ${match.name}.`,
      );

      confirmTimerRef.current = setTimeout(() => {
        onDestinationSelected(match.buildingId, match.name);
        resetToIdle();
      }, 900);
    },
    [onDestinationSelected, resetToIdle],
  );

  const resolveDisambiguationMatch = useCallback(
    (text: string, options: DestinationMatch[]): DestinationMatch | null => {
      const normalized = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return null;

      const ordinalMap: Record<string, number> = {
        '1': 0,
        one: 0,
        first: 0,
        '2': 1,
        two: 1,
        second: 1,
      };
      if (normalized in ordinalMap) {
        return options[ordinalMap[normalized]] ?? null;
      }

      const normalizedOptions = options.map((option) => ({
        option,
        normalizedName: option.name
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      }));

      const exact = normalizedOptions.find(({ normalizedName }) => normalizedName === normalized);
      if (exact) return exact.option;

      const prefixMatches = normalizedOptions.filter(({ normalizedName }) =>
        normalizedName.startsWith(normalized),
      );
      if (prefixMatches.length === 1) return prefixMatches[0].option;

      const includesMatches = normalizedOptions.filter(({ normalizedName }) =>
        normalizedName.includes(normalized),
      );
      if (includesMatches.length === 1) return includesMatches[0].option;

      return null;
    },
    [],
  );

  // ── Match processing (defined before event handlers to avoid stale closure) ──

  const processTranscript = useCallback(
    (text: string) => {
      setSttState('transcribing');

      if (sttState === 'disambiguating' && matches.length > 0) {
        const selected = resolveDisambiguationMatch(text, matches);
        if (selected) {
          confirmMatch(selected);
          return;
        }

        const names = matches.map((match) => match.name).join(' or ');
        setSttState('disambiguating');
        Speech.stop();
        Speech.speak(`I heard ${text}. Did you mean ${names}?`);
        AccessibilityInfo.announceForAccessibility(`I heard ${text}. Did you mean ${names}?`);
        return;
      }

      const results = fuzzySearch(text, campusId);

      if (results.length === 0) {
        setError(`No destination found for "${text}". Try again or spell it out.`);
        AccessibilityInfo.announceForAccessibility(
          `No destination found for ${text}. Try again or spell it out.`,
        );
        setSttState('error');
        return;
      }

      const best = results[0];
      const ambiguous = results.filter(
        (r: FuseMatch) => r.score - best.score <= AMBIGUITY_SCORE_DELTA,
      );

      if (ambiguous.length > 1) {
        const topTwo = ambiguous
          .slice(0, 2)
          .map((r: FuseMatch) => ({ buildingId: r.item.id, name: r.item.name }));
        setMatches(topTwo);
        setPendingMatch(null);
        setSttState('disambiguating');
        const names = topTwo.map((m) => m.name).join(' or ');
        Speech.stop();
        Speech.speak(`Did you mean ${names}?`);
        AccessibilityInfo.announceForAccessibility(`Did you mean: ${names}?`);
      } else {
        confirmMatch({ buildingId: best.item.id, name: best.item.name });
      }
    },
    [campusId, confirmMatch, matches, resolveDisambiguationMatch, sttState],
  );

  // ── STT event handlers (wrapped in useCallback for stable references) ──

  const handleResult = useCallback(
    (event: { results: Array<{ transcript?: string }> }) => {
      if (event.results.length === 0) return;
      const text = event.results[0].transcript ?? '';
      setTranscript(text);
      clearTimers();
      processTranscript(text);
    },
    [clearTimers, processTranscript],
  );

  const handleError = useCallback(
    (event: { error: string; message: string }) => {
      clearTimers();
      if (event.error === 'no-speech') {
        setError('No speech detected. Tap to try again.');
        AccessibilityInfo.announceForAccessibility('No speech detected. Tap to try again.');
        setSttState('error');
      } else if (event.error === 'aborted') {
        // Triggered by our own abort() call (e.g. no-speech timeout). The
        // no-speech message and state are already set before abort() fires,
        // so there is nothing further to do here.
      } else {
        setError(`Recognition error: ${event.message}`);
        setSttState('error');
      }
      isPausedRef.current = false;
      pauseResolverRef.current?.();
      pauseResolverRef.current = null;
    },
    [clearTimers],
  );

  const handleEnd = useCallback(() => {
    isPausedRef.current = false;
    pauseResolverRef.current?.();
    pauseResolverRef.current = null;
  }, []);

  useSpeechRecognitionEvent('result', handleResult);
  useSpeechRecognitionEvent('error', handleError);
  useSpeechRecognitionEvent('end', handleEnd);

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
        ExpoSpeechRecognitionModule.abort();
        setError('No speech detected. Tap to try again.');
        AccessibilityInfo.announceForAccessibility('No speech detected. Tap to try again.');
        setSttState('error');
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
  }, [pendingMatch, onDestinationSelected, clearTimers, resetToIdle]);

  const rejectDestination = useCallback(() => {
    clearTimers();
    setPendingMatch(null);
    void startListening();
  }, [startListening, clearTimers]);

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

  // Check permission status on mount. The onboarding flow handles the
  // actual permission request with proper accessibility support.
  useEffect(() => {
    void ExpoSpeechRecognitionModule.getPermissionsAsync().then((r) => {
      if (!r.granted) setSttUnavailable(true);
    });
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
