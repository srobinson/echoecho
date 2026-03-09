/**
 * STT session state contract.
 *
 * Owned by ALP-954 (useSttDestination). Consumed by ALP-958 (useHapticEngine)
 * to pause haptics before firing so iOS Taptic Engine suppression during
 * active dictation does not silently drop turn cues.
 *
 * See ios-haptic-stt-conflict-findings.md for the full workaround rationale.
 */
export interface SttSessionState {
  isActive: boolean;
  /**
   * Pause STT. Callers should await this before firing any haptic pattern.
   * Resolves immediately if STT is already inactive.
   */
  requestPause: () => Promise<void>;
  /**
   * Returns true when STT has fully stopped and haptics are safe to fire.
   * Check this after requestPause — it may still be false if stop took > 200ms.
   */
  confirmPaused: () => boolean;
  /** Resume STT after haptic completes. No-op if STT was never active. */
  resume: () => void;
}
