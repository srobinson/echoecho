/**
 * ALP-952: Bottom sheet for selecting a hazard type during route recording.
 * ALP-970: Also used by the admin hazard management panel.
 *
 * Coordinate is captured at confirm time (not tap time) — the parent
 * reads currentPosition in its onConfirm handler.
 */
import React, { forwardRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import type { HazardType } from '@echoecho/shared';

// ── Config ────────────────────────────────────────────────────────────────────

interface HazardMeta {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const HAZARD_META: Record<HazardType, HazardMeta> = {
  uneven_surface: { label: 'Uneven Surface', icon: 'warning-outline' },
  construction:   { label: 'Construction',   icon: 'construct-outline' },
  stairs_unmarked:{ label: 'Unmarked Stairs', icon: 'layers-outline' },
  low_clearance:  { label: 'Low Clearance',  icon: 'arrow-down-outline' },
  seasonal:       { label: 'Seasonal Hazard', icon: 'calendar-outline' },
  wet_surface:    { label: 'Wet Surface',    icon: 'water-outline' },
  other:          { label: 'Other Hazard',   icon: 'alert-circle-outline' },
};

const HAZARD_TYPES = Object.keys(HAZARD_META) as HazardType[];

interface ExpiryOption {
  label: string;
  isoValue: string | null;
}

function buildExpiryOptions(): ExpiryOption[] {
  const now = Date.now();
  return [
    { label: 'Permanent',  isoValue: null },
    { label: 'Expires in 1 day',   isoValue: new Date(now + 86_400_000).toISOString() },
    { label: 'Expires in 1 week',  isoValue: new Date(now + 7 * 86_400_000).toISOString() },
    { label: 'Expires in 1 month', isoValue: new Date(now + 30 * 86_400_000).toISOString() },
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HazardPickerSheetProps {
  onConfirm: (params: { type: HazardType; expiresAt: string | null }) => void;
  onDismiss: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const HazardPickerSheet = forwardRef<BottomSheet, HazardPickerSheetProps>(
  ({ onConfirm, onDismiss }, ref) => {
    const [selectedType, setSelectedType] = useState<HazardType | null>(null);
    const [selectedExpiryIndex, setSelectedExpiryIndex] = useState(0);
    const [openCount, setOpenCount] = useState(0);

    const handleOpen = useCallback(() => {
      setSelectedType(null);
      setSelectedExpiryIndex(0);
      setOpenCount((c) => c + 1);
      AccessibilityInfo.announceForAccessibility('Hazard picker open. Select a hazard type.');
    }, []);

    const handleConfirm = useCallback(() => {
      if (!selectedType) return;
      const opts = buildExpiryOptions();
      onConfirm({
        type: selectedType,
        expiresAt: opts[selectedExpiryIndex]?.isoValue ?? null,
      });
    }, [selectedType, selectedExpiryIndex, onConfirm]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          onPress={onDismiss}
        />
      ),
      [onDismiss],
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps -- openCount triggers fresh Date.now() on each sheet open
    const expiryOpts = useMemo(() => buildExpiryOptions(), [openCount]);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={['55%', '75%']}
        enablePanDownToClose
        onClose={onDismiss}
        onChange={(index) => { if (index === 0 || index === 1) handleOpen(); }}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.sheetBg}
      >
        <BottomSheetView style={styles.container}>
          <Text style={styles.heading}>Mark Hazard</Text>

          {/* Hazard type list */}
          {HAZARD_TYPES.map((type) => {
            const meta = HAZARD_META[type];
            const isSelected = selectedType === type;
            return (
              <Pressable
                key={type}
                style={[styles.hazardRow, isSelected && styles.hazardRowSelected]}
                onPress={() => setSelectedType(type)}
                accessibilityLabel={meta.label}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Ionicons
                  name={meta.icon}
                  size={22}
                  color={isSelected ? '#6c63ff' : '#a0a0c0'}
                />
                <Text style={[styles.hazardLabel, isSelected && styles.hazardLabelSelected]}>
                  {meta.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color="#6c63ff" style={styles.check} />
                )}
              </Pressable>
            );
          })}

          {/* Expiry selector */}
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.expiryRow}>
            {expiryOpts.map((opt, idx) => (
              <Pressable
                key={idx}
                style={[styles.expiryChip, selectedExpiryIndex === idx && styles.expiryChipSelected]}
                onPress={() => setSelectedExpiryIndex(idx)}
                accessibilityLabel={opt.label}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedExpiryIndex === idx }}
              >
                <Text
                  style={[
                    styles.expiryChipText,
                    selectedExpiryIndex === idx && styles.expiryChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onDismiss}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, !selectedType && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!selectedType}
              accessibilityLabel={
                selectedType
                  ? `Confirm hazard: ${HAZARD_META[selectedType].label}`
                  : 'Select a hazard type first'
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedType }}
            >
              <Text style={styles.confirmText}>Confirm Hazard</Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

HazardPickerSheet.displayName = 'HazardPickerSheet';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: '#1a1a2e' },
  handle:  { backgroundColor: '#4a4a6a' },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heading: {
    color: '#e8e8f0',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  hazardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
    backgroundColor: '#22223a',
  },
  hazardRowSelected: {
    backgroundColor: '#2a2050',
    borderWidth: 1,
    borderColor: '#6c63ff',
  },
  hazardLabel: {
    flex: 1,
    color: '#c0c0d8',
    fontSize: 15,
  },
  hazardLabelSelected: {
    color: '#e8e8f0',
    fontWeight: '600',
  },
  check: { marginLeft: 'auto' },
  sectionLabel: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expiryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#22223a',
    borderWidth: 1,
    borderColor: '#3a3a5a',
  },
  expiryChipSelected: {
    borderColor: '#6c63ff',
    backgroundColor: '#2a2050',
  },
  expiryChipText: {
    color: '#8888aa',
    fontSize: 12,
  },
  expiryChipTextSelected: {
    color: '#6c63ff',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#22223a',
    minHeight: 56,
    justifyContent: 'center',
  },
  cancelText: {
    color: '#8888aa',
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#6c63ff',
    minHeight: 56,
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#3a3a5a',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
