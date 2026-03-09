/**
 * Shared location permission helpers used by both admin (ALP-947) and student (ALP-956) apps.
 *
 * iOS two-step: request foreground first, then background in a separate call.
 * Android 10+: same separation — foreground (ACCESS_FINE_LOCATION) then background
 * (ACCESS_BACKGROUND_LOCATION) in a distinct runtime prompt. Never request both simultaneously.
 * Android 12+: foreground service type "location" is required for background tracking; this
 * is configured via the expo-location plugin in app.json, not at runtime here.
 */
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export type PermissionOutcome =
  | { granted: true }
  | { granted: false; canAskAgain: boolean };

export type LocationPermissions = {
  foreground: PermissionOutcome;
  background: PermissionOutcome;
};

export async function requestForegroundLocationPermission(): Promise<PermissionOutcome> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted' ? { granted: true } : { granted: false, canAskAgain };
}

/**
 * Requests foreground then background permissions in sequence.
 * Returns early with background={granted:false} if foreground is denied.
 *
 * On Android 10+ the OS enforces the separation — do not call requestBackgroundPermissionsAsync
 * without a prior foreground grant.
 */
export async function requestLocationPermissions(): Promise<LocationPermissions> {
  const foreground = await requestForegroundLocationPermission();
  if (!foreground.granted) {
    return { foreground, background: { granted: false, canAskAgain: false } };
  }

  const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
  const background: PermissionOutcome =
    status === 'granted' ? { granted: true } : { granted: false, canAskAgain };

  return { foreground, background };
}

export async function getForegroundLocationPermission(): Promise<PermissionOutcome> {
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  return status === 'granted' ? { granted: true } : { granted: false, canAskAgain };
}

export async function getBackgroundLocationPermission(): Promise<PermissionOutcome> {
  const { status, canAskAgain } = await Location.getBackgroundPermissionsAsync();
  return status === 'granted' ? { granted: true } : { granted: false, canAskAgain };
}

/** Opens the app's system settings page so the user can manually grant location access. */
export function openLocationSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}
