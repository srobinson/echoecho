/**
 * Design tokens for the EchoEcho design system.
 *
 * All colour and spacing values used across both apps live here.
 * Import from '@echoecho/ui' and reference tokens instead of
 * hardcoded hex/pixel values. This enables future theming,
 * dark/light mode switching, and high-contrast accessibility mode.
 */

export const colors = {
  // Backgrounds
  bg: '#0f0f1a',
  bgDeep: '#0a0a14',
  surface: '#1a1a2e',
  surfaceAlt: '#14142a',
  surfaceElevated: '#22223a',

  // Borders and dividers
  border: '#2a2a3e',
  borderAlt: '#2a2a4e',
  borderSubtle: '#3a3a5e',
  borderMuted: '#1e1a3e',

  // Brand
  brand: '#6c63ff',
  brandMuted: '#4444aa',
  brandOverlay: '#6c63ff22',
  brandOverlayMedium: '#6c63ff44',

  // Text
  textPrimary: '#e8e8f0',
  textSecondary: '#c0c0e8',
  textMuted: '#8888aa',
  textSubtle: '#5555aa',
  textFaint: '#6666aa',
  textLabel: '#9090cc',
  textLight: '#e0e0f8',
  textDim: '#7070aa',
  textHighlight: '#a5b4fc',
  textPale: '#c0c0d8',
  textGhost: '#f0f0ff',
  white: '#fff',
  whiteHex: '#FFFFFF',

  // Status
  success: '#22C55E',
  successDark: '#48bb78',
  warning: '#F59E0B',
  warningAlt: '#fbbf24',
  warningGold: '#ffe066',
  warningAmber: '#FFD740',
  danger: '#e53e3e',
  dangerAlt: '#ef4444',
  dangerBright: '#EF4444',
  dangerAccent: '#FF5252',
  dangerLight: '#FFB3B3',
  dangerRed: '#ff6b6b',
  dangerMuted: '#fca5a5',
  orange: '#F97316',
  orangeAlt: '#ed8936',
  neutral: '#9CA3AF',
  yellowAlert: '#eab308',

  // Interactive
  dangerBg: '#3a0a0a',
  dangerBorder: '#7f1d1d',

  // Transparent overlays
  surfaceTranslucent: '#1a1a2eee',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const fontSizes = {
  xs: 9,
  sm: 11,
  md: 13,
  lg: 15,
  xl: 17,
  xxl: 18,
  display: 28,
  hero: 32,
  mega: 36,
} as const;
