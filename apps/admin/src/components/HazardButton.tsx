/**
 * ALP-952: FAB that opens HazardPickerSheet and commits the hazard
 * to the recording store at current GPS position.
 *
 * Coordinate is taken from the last track point at confirm time,
 * not at button-tap time (users take time to select a type).
 */
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { HazardPickerSheet } from '@echoecho/ui';
import type { HazardType } from '@echoecho/shared';

import { useRecordingStore } from '../stores/recordingStore';

const HAZARD_LABELS: Record<HazardType, string> = {
  uneven_surface:  'Uneven Surface',
  construction:    'Construction',
  stairs_unmarked: 'Unmarked Stairs',
  low_clearance:   'Low Clearance',
  seasonal:        'Seasonal Hazard',
  wet_surface:     'Wet Surface',
  other:           'Other Hazard',
};

export function HazardButton() {
  const sheetRef = useRef<BottomSheet>(null);
  const store = useRecordingStore();

  const openSheet = useCallback(() => {
    sheetRef.current?.snapToIndex(0);
  }, []);

  const handleConfirm = useCallback(
    ({ type, expiresAt }: { type: HazardType; expiresAt: string | null }) => {
      sheetRef.current?.close();

      const trackPoints = store.session?.trackPoints ?? [];
      const last = trackPoints[trackPoints.length - 1];
      if (!last) return;

      store.addPendingHazard({
        localId: `hazard-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        coordinate: {
          latitude: last.latitude,
          longitude: last.longitude,
          altitude: last.altitude,
        },
        type,
        severity: 'medium',
        title: HAZARD_LABELS[type],
        description: null,
        expiresAt,
        capturedAt: Date.now(),
      });
    },
    [store],
  );

  const handleDismiss = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={openSheet}
        accessibilityLabel="Mark hazard at current location"
        accessibilityRole="button"
      >
        <Ionicons name="warning" size={22} color="#fff" />
      </Pressable>

      <HazardPickerSheet
        ref={sheetRef}
        onConfirm={handleConfirm}
        onDismiss={handleDismiss}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#dd6b20',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    minHeight: 56,
  },
  btnPressed: { opacity: 0.75 },
});
