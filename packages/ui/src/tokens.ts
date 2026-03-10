/**
 * Design tokens for the EchoEcho design system.
 *
 * All colour and spacing values used across both apps live here.
 * Import from '@echoecho/ui' and reference tokens instead of
 * hardcoded hex/pixel values. This enables future theming,
 * dark/light mode switching, and high-contrast accessibility mode.
 */

export const colors = {
  // Backgrounds — neutral dark, no purple tint
  bg: '#0A0A0F',
  bgDeep: '#060608',
  surface: '#111116',
  surfaceAlt: '#0D0D12',
  surfaceElevated: '#18181F',

  // Borders and dividers — neutral with slight luminance only
  border: '#1E1E26',
  borderAlt: '#22222C',
  borderSubtle: '#2A2A35',
  borderMuted: '#16161C',

  // Brand — sky blue (was purple)
  brand: '#4FC3F7',
  brandMuted: '#1A5F7A',
  brandOverlay: '#4FC3F722',
  brandOverlayMedium: '#4FC3F744',

  // Text — neutral whites, no purple cast
  textPrimary: '#F0F0F5',
  textSecondary: '#A8A8B8',
  textMuted: '#606070',
  textSubtle: '#404050',
  textFaint: '#505060',
  textLabel: '#808090',
  textLight: '#E0E0E8',
  textDim: '#585868',
  textHighlight: '#4FC3F7',
  textPale: '#C0C0C8',
  textGhost: '#F5F5FA',
  white: '#fff',
  whiteHex: '#FFFFFF',

  // Status
  success: '#81C784',
  successDark: '#66BB6A',
  warning: '#FFB74D',
  warningAlt: '#FFA726',
  warningGold: '#FFD54F',
  warningAmber: '#FFB74D',
  danger: '#F06292',
  dangerAlt: '#EC407A',
  dangerBright: '#F06292',
  dangerAccent: '#FF4081',
  dangerLight: '#F48FB1',
  dangerRed: '#F06292',
  dangerMuted: '#F8BBD0',
  orange: '#FFB74D',
  orangeAlt: '#FFA726',
  neutral: '#9E9EAE',
  yellowAlert: '#FFD54F',

  // Interactive
  dangerBg: '#1A080E',
  dangerBorder: '#4A1528',

  // Transparent overlays
  surfaceTranslucent: '#111116EE',
} as const;

export type ColorToken = keyof typeof colors;

// Per-section accent colors for the admin tab bar.
// Each maps to the semantic meaning of that area.
export const tabColors = {
  map:       '#4FC3F7', // sky blue   — spatial / navigation
  routes:    '#81C784', // soft green — paths / movement
  buildings: '#FFB74D', // warm amber — physical structures
  hazards:   '#F06292', // pink       — danger / alerts
  analytics: '#CE93D8', // violet     — data / insights
  settings:  '#9E9EAE', // neutral    — system / config
} as const;

export type TabColorKey = keyof typeof tabColors;

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
