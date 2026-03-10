/**
 * MapDetailPanel — bottom sheet extension point for map feature detail.
 *
 * ALP-965 spec:
 *   - Bottom sheet slides up on feature tap (building, route, waypoint)
 *   - Accepts `detailContent: React.ReactNode` prop — the extension point
 *     for ALP-966, ALP-967, ALP-968 to render into without modifying this file
 *   - On open: screen reader focus moves to panel heading
 *   - `feature` discriminant determines which panel type to show
 *
 * The `detailContent` prop is the sole integration boundary. Child issues
 * pass pre-rendered JSX here. This component owns the sheet chrome (handle,
 * close button, scroll container) only.
 *
 * Accessibility:
 *   - Sheet heading gets focus on open via panelHeadingRef
 *   - Close button: accessibilityLabel="Close detail panel"
 *   - accessibilityViewIsModal={true} when sheet is open
 */

import { useRef, useEffect, memo, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';

export type DetailFeatureType = 'building' | 'route' | 'waypoint' | null;

export interface DetailFeature {
  type: DetailFeatureType;
  id: string;
  name: string;
}

interface Props {
  feature: DetailFeature | null;
  detailContent: ReactNode;
  onClose: () => void;
}

const SNAP_POINTS = ['40%', '80%'];

export const MapDetailPanel = memo(function MapDetailPanel({ feature, detailContent, onClose }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const headingRef = useRef<View>(null);

  useEffect(() => {
    if (feature) {
      sheetRef.current?.snapToIndex(0);
      const timer = setTimeout(() => {
        if (headingRef.current) {
          AccessibilityInfo.setAccessibilityFocus(
            headingRef.current as unknown as number,
          );
        }
      }, 350);
      return () => clearTimeout(timer);
    } else {
      sheetRef.current?.close();
    }
  }, [feature]);

  const featureTypeLabel =
    feature?.type === 'building'
      ? 'Building'
      : feature?.type === 'route'
      ? 'Route'
      : feature?.type === 'waypoint'
      ? 'Waypoint'
      : '';

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView
        style={styles.content}
        accessibilityViewIsModal={feature != null}
      >
        <View style={styles.header}>
          <View ref={headingRef} accessible accessibilityRole="header">
            <Text style={styles.featureType}>{featureTypeLabel}</Text>
            <Text style={styles.featureName} numberOfLines={2}>
              {feature?.name ?? ''}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={onClose}
            accessibilityLabel="Close detail panel"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color="#808090" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {detailContent}
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: '#111116',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    backgroundColor: '#1A5F7A',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E26',
    gap: 12,
  },
  featureType: {
    color: '#808090',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  featureName: {
    color: '#F0F0F5',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  closeBtnPressed: { opacity: 0.7 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
});
