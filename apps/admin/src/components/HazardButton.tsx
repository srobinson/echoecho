/**
 * ALP-952: FAB that opens HazardPickerSheet and commits the hazard
 * to the recording store at current GPS position.
 *
 * Coordinate is taken from the last track point at confirm time,
 * not at button-tap time (users take time to select a type).
 */
import React, { useCallback, useRef } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { HazardPickerSheet } from '@echoecho/ui';
import type { HazardType } from '@echoecho/shared';

import { useRecordingStore } from '../stores/recordingStore';

interface Props {
  onOpenSheet?: () => void;
  renderSheet?: boolean;
}

const HAZARD_LABELS: Record<HazardType, string> = {
  uneven_surface:  'Uneven Surface',
  construction:    'Construction',
  stairs_unmarked: 'Unmarked Stairs',
  low_clearance:   'Low Clearance',
  seasonal:        'Seasonal Hazard',
  wet_surface:     'Wet Surface',
  other:           'Other Hazard',
};

export function HazardButton({ onOpenSheet, renderSheet = true }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const store = useRecordingStore();

  const openSheet = useCallback(() => {
    if (onOpenSheet) {
      onOpenSheet();
      return;
    }
    sheetRef.current?.snapToIndex(0);
  }, [onOpenSheet]);

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
        accessibilityHint="Double tap to select a hazard type at your current GPS position"
      >
        <Ionicons name="warning" size={22} color="#fff" />
        <Text style={styles.btnLabel}>Hazard</Text>
      </Pressable>

      {renderSheet && (
        <HazardPickerSheet
          ref={sheetRef}
          onConfirm={handleConfirm}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFA726',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    minHeight: 56,
    gap: 4,
  },
  btnLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnPressed: { opacity: 0.75 },
});
