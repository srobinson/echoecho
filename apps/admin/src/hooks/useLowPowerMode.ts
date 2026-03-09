/**
 * Returns whether Low Power Mode is active on iOS.
 *
 * On Android and in simulators, always returns false.
 * Uses expo-battery when available; gracefully degrades to false if the
 * native module is absent (e.g., before `yarn install` after adding it).
 *
 * Requires expo-battery in package.json (already added; run yarn install).
 */
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

// Inline the subset of expo-battery's API we need so the file typechecks
// even before expo-battery is installed in node_modules.
interface BatteryModule {
  isLowPowerModeEnabledAsync(): Promise<boolean>;
  addLowPowerModeListener(
    cb: (evt: { lowPowerMode: boolean }) => void,
  ): { remove(): void };
}

export function useLowPowerMode(): boolean {
  const [lowPowerMode, setLowPowerMode] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let battery: BatteryModule | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      battery = require('expo-battery') as BatteryModule;
    } catch {
      // expo-battery not yet installed; low-power detection unavailable.
      return;
    }

    let subscription: { remove(): void } | null = null;

    battery
      .isLowPowerModeEnabledAsync()
      .then(setLowPowerMode)
      .catch(() => {});

    subscription = battery.addLowPowerModeListener(({ lowPowerMode: lpm }) => {
      setLowPowerMode(lpm);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return lowPowerMode;
}
