import type { HapticPattern } from '../types/navigation';

/**
 * Maps a relative bearing (degrees) to a haptic pattern.
 *
 * Bearing ranges (relative to current heading):
 *   -180 to -135 → u_turn
 *   -135 to  -60 → turn_left_sharp
 *    -60 to  -20 → turn_left
 *    -20 to   -5 → turn_left_slight
 *     -5 to    5 → straight
 *      5 to   20 → turn_right_slight
 *     20 to   60 → turn_right
 *     60 to  135 → turn_right_sharp
 *    135 to  180 → u_turn
 */
export function bearingToHaptic(relativeBearing: number): HapticPattern {
  const b = ((relativeBearing + 180) % 360) - 180; // normalize to -180..180

  if (b < -135 || b > 135) return 'u_turn';
  if (b < -60) return 'turn_left_sharp';
  if (b < -20) return 'turn_left';
  if (b < -5) return 'turn_left_slight';
  if (b <= 5) return 'straight';
  if (b <= 20) return 'turn_right_slight';
  if (b <= 60) return 'turn_right';
  return 'turn_right_sharp';
}

/** Human-readable label for a haptic pattern (used in audio announcements). */
export function hapticPatternLabel(pattern: HapticPattern): string {
  const labels: Record<HapticPattern, string> = {
    turn_left_sharp: 'sharp left',
    turn_left: 'turn left',
    turn_left_slight: 'slight left',
    straight: 'continue straight',
    turn_right_slight: 'slight right',
    turn_right: 'turn right',
    turn_right_sharp: 'sharp right',
    u_turn: 'make a U-turn',
    arrived: 'you have arrived',
    hazard_warning: 'hazard ahead',
    off_route: 'off route',
    rerouting: 'rerouting',
  };
  return labels[pattern];
}
