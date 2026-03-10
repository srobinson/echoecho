/**
 * Walk-and-Record screen (ALP-949).
 *
 * Owns the recording UI surface:
 *   - Satellite map with live polyline and waypoint/hazard markers
 *   - RecordingBottomBar (elapsed time, distance, GPS accuracy, controls)
 *   - VoiceAnnotationSheet wired to the Waypoint button
 *   - HazardButton + HazardPickerSheet (ALP-952, injected via hazardSlot)
 *   - 30-second accessibility announcements while recording
 *
 * GPS service, waypoint detection, and recording state live in
 * useGpsRecording + useRecordingStore (mobile-engineer owned, ALP-947/948).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  AccessibilityInfo,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import BottomSheet from '@gorhom/bottom-sheet';
import { HazardPickerSheet } from '@echoecho/ui';

import { MAPBOX_STYLE_SATELLITE } from '../src/lib/mapbox';
import { useRecordingStore } from '../src/stores/recordingStore';
import { useCampusStore } from '../src/stores/campusStore';
import { useMapViewportStore } from '../src/stores/mapViewportStore';
import { useGpsRecording } from '../src/hooks/useGpsRecording';
import { useAdminMapData } from '../src/hooks/useAdminMapData';
import { computeDistance } from '@echoecho/shared';
import { clearPersistedBuffer } from '../src/services/gpsRecordingService';

import { RecordingBottomBar } from '../src/components/RecordingBottomBar';
import { VoiceAnnotationSheet } from '../src/components/VoiceAnnotationSheet';
import { HazardButton } from '../src/components/HazardButton';
import { BuildingLayer } from '../src/components/map/BuildingLayer';
import type { HazardType } from '@echoecho/shared';

function logRecordDebug(step: string, details?: unknown) {
  if (!__DEV__) return;
  if (details === undefined) {
    console.log(`[RecordDebug] ${step}`);
    return;
  }
  console.log(`[RecordDebug] ${step}`, details);
}

// Fallback center when stores are empty (TSBVI campus, Austin TX)
const FALLBACK_CENTER: [number, number] = [-97.7468, 30.3495];

// Waypoint type → color for marker dot
const WAYPOINT_COLORS: Record<string, string> = {
  turn:          '#4FC3F7',
  regular:       '#66BB6A',
  start:         '#66BB6A',
  end:           '#F06292',
  decision_point:'#FFA726',
  landmark:      '#4FC3F7',
  hazard:        '#FFA726',
  door:          '#805ad5',
  elevator:      '#4FC3F7',
  stairs:        '#d69e2e',
  ramp:          '#319795',
  crossing:      '#F06292',
};

const HAZARD_COLORS: Record<string, string> = {
  uneven_surface:  '#FFA726',
  construction:    '#f6ad55',
  stairs_unmarked: '#F06292',
  low_clearance:   '#FFA726',
  seasonal:        '#4FC3F7',
  wet_surface:     '#4FC3F7',
  other:           '#606070',
};

export default function RecordScreen() {
  logRecordDebug('render:start');
  const {
    permissionStatus,
    isDegraded,
    requestPermissions,
    startRecording: gpsStart,
    pauseRecording: gpsPause,
    resumeRecording: gpsResume,
    stopRecording: gpsStop,
    openSettings,
  } = useGpsRecording();

  const store = useRecordingStore();
  const { session } = store;

  const activeCampus = useCampusStore((s) => s.activeCampus);
  const savedCenter = useMapViewportStore((s) => s.center);
  const savedZoom = useMapViewportStore((s) => s.zoom);

  // Inherit the viewport the user was looking at on the main map.
  // Falls back to campus center if the store has no captured position yet.
  const initialCenter = useMemo<[number, number]>(
    () => savedCenter
      ?? (activeCampus
        ? [activeCampus.center.longitude, activeCampus.center.latitude]
        : FALLBACK_CENTER),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCampus?.id],
  );
  const initialZoom = savedZoom ?? 17;
  const { buildings } = useAdminMapData(activeCampus?.id ?? null);

  // Tick state drives elapsed-time re-renders at 1 Hz while recording
  const [tick, setTick] = useState(0);
  const lastAnnouncedSecRef = useRef(0);
  const voiceSheetRef = useRef<BottomSheet>(null);
  const hazardSheetRef = useRef<BottomSheet>(null);
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);

  const isRecording = session?.state === 'recording';
  const isPaused    = session?.state === 'paused';

  const trackPoints      = useMemo(() => session?.trackPoints ?? [], [session]);
  const pendingWaypoints = useMemo(() => session?.pendingWaypoints ?? [], [session]);
  const pendingHazards   = useMemo(() => session?.pendingHazards ?? [], [session]);

  // ── Elapsed time ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const elapsedMs = useMemo(() => {
    if (!session) return 0;
    const pausedContribution = session.pausedAt
      ? Date.now() - session.pausedAt
      : 0;
    return Date.now() - session.startedAt - session.totalPausedMs - (isPaused ? pausedContribution : 0);
  // tick is intentionally included: it advances at 1 Hz while recording,
  // ensuring the elapsed time re-evaluates even when no GPS data arrives
  // (e.g. battery-saver mode with infrequent location updates).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPaused, tick]);

  // ── Distance ───────────────────────────────────────────────────────────────

  const distanceMeters = useMemo(() => {
    if (trackPoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      total += computeDistance(trackPoints[i - 1], trackPoints[i]);
    }
    return total;
  }, [trackPoints]);

  // ── GPS accuracy ───────────────────────────────────────────────────────────

  const gpsAccuracy = trackPoints[trackPoints.length - 1]?.accuracy ?? null;

  // ── 30-second accessibility announcements ─────────────────────────────────

  useEffect(() => {
    if (!isRecording) return;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const slot = Math.floor(elapsedSec / 30);
    if (slot > lastAnnouncedSecRef.current) {
      lastAnnouncedSecRef.current = slot;
      const distText =
        distanceMeters < 1000
          ? `${Math.round(distanceMeters)} meters`
          : `${(distanceMeters / 1000).toFixed(1)} kilometers`;
      AccessibilityInfo.announceForAccessibility(
        `Recording: ${formatElapsed(elapsedMs)} elapsed, ${distText} walked`,
      );
    }
  }, [elapsedMs, distanceMeters, isRecording]);

  // ── Permission request ───────────────────────────────────────────────────

  useEffect(() => {
    logRecordDebug('permissions:effect', { permissionStatus });
    if (permissionStatus === 'unknown') {
      requestPermissions();
    }
  }, [permissionStatus, requestPermissions]);

  // ── Recording control ─────────────────────────────────────────────────────

  const startInFlight = useRef(false);

  const handleStart = useCallback(async () => {
    logRecordDebug('handleStart:entered', { permissionStatus });
    if (permissionStatus === 'unknown') return;

    if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
      Alert.alert(
        'Location Permission Required',
        'Enable location access in Settings to record routes.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openSettings },
        ],
      );
      return;
    }

    if (permissionStatus === 'foreground_only') {
      Alert.alert(
        'Background Location Required',
        'This app needs "Always" location access to record routes while the screen is off. Please update the permission in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openSettings },
        ],
      );
      return;
    }

    // Prevent concurrent calls (auto-start + manual tap race)
    if (startInFlight.current) return;
    startInFlight.current = true;

    try {
      logRecordDebug('handleStart:clearPersistedBuffer');
      // Clear any stale persisted buffer before starting fresh
      await clearPersistedBuffer();
      logRecordDebug('handleStart:gpsStart:before');
      await gpsStart();
      if (activeCampus?.id) {
        store.updateSessionMeta('', '', activeCampus.id);
      }
      logRecordDebug('handleStart:gpsStart:after');
    } catch (e) {
      console.error('[RecordDebug] handleStart:error', e);
      store.clearSession();
      Alert.alert(
        'Could Not Start Recording',
        e instanceof Error ? e.message : 'GPS service failed to start. Check location permissions and try again.',
      );
    } finally {
      startInFlight.current = false;
    }
  }, [permissionStatus, gpsStart, openSettings, store, activeCampus?.id]);

  const handleStop = useCallback(() => {
    Alert.alert('Stop Recording', 'What would you like to do with this route?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await gpsStop();
          store.clearSession();
          router.back();
        },
      },
      {
        text: 'Save Route',
        onPress: async () => {
          await gpsStop();
          router.replace('/save-route');
        },
      },
    ]);
  }, [gpsStop, store]);

  const handleWaypoint = useCallback(() => {
    const last = trackPoints[trackPoints.length - 1];
    if (!last) return;

    const localId = `manual-${Date.now()}`;
    store.addPendingWaypoint({
      localId,
      coordinate: { latitude: last.latitude, longitude: last.longitude, altitude: last.altitude },
      type: 'landmark',
      audioLabel: null,
      description: null,
      photoUri: null,
      audioAnnotationUri: null,
      capturedAt: Date.now(),
    });
    setActiveWaypointId(localId);
    voiceSheetRef.current?.snapToIndex(0);
  }, [trackPoints, store]);

  const handleOpenHazardSheet = useCallback(() => {
    hazardSheetRef.current?.snapToIndex(0);
  }, []);

  const handleHazardConfirm = useCallback(
    ({ type, expiresAt }: { type: HazardType; expiresAt: string | null }) => {
      hazardSheetRef.current?.close();

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
        title: type.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        description: null,
        expiresAt,
        capturedAt: Date.now(),
      });
    },
    [trackPoints, store],
  );

  // ── Map GeoJSON ────────────────────────────────────────────────────────────

  const trackGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = useMemo(
    () => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: trackPoints.map((p) => [p.longitude, p.latitude]),
      },
      properties: {},
    }),
    [trackPoints],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MAPBOX_STYLE_SATELLITE}
        logoEnabled={false}
        attributionPosition={{ bottom: 8, right: 8 }}
      >
        {/* centerCoordinate always present (never undefined). followUserLocation
            takes priority when isRecording is true. Matches the working pattern
            from commit 2c3766c. */}
        <MapboxGL.Camera
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: initialZoom,
          }}
          centerCoordinate={initialCenter}
          zoomLevel={initialZoom}
          animationMode="moveTo"
          animationDuration={0}
        />

        <MapboxGL.UserLocation visible animated />

        <BuildingLayer
          buildings={buildings}
          onBuildingPress={() => {}}
        />

        {trackPoints.length > 1 && (
          <MapboxGL.ShapeSource id="live-track" shape={trackGeoJSON}>
            <MapboxGL.LineLayer
              id="live-track-line"
              style={{
                lineColor: '#F06292',
                lineWidth: 3,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Pending waypoint markers */}
        {pendingWaypoints.map((wp) => (
          <MapboxGL.MarkerView
            key={wp.localId}
            coordinate={[wp.coordinate.longitude, wp.coordinate.latitude]}
          >
            <WaypointDot
              color={WAYPOINT_COLORS[wp.type] ?? '#66BB6A'}
              label={wp.type}
            />
          </MapboxGL.MarkerView>
        ))}

        {/* Pending hazard markers */}
        {pendingHazards.map((hz) => (
          <MapboxGL.MarkerView
            key={hz.localId}
            coordinate={[hz.coordinate.longitude, hz.coordinate.latitude]}
          >
            <HazardDot
              color={HAZARD_COLORS[hz.type] ?? '#FFA726'}
              label={hz.title}
            />
          </MapboxGL.MarkerView>
        ))}
      </MapboxGL.MapView>

      <RecordingBottomBar
        recordingState={session?.state ?? null}
        elapsedMs={elapsedMs}
        distanceMeters={distanceMeters}
        gpsAccuracy={gpsAccuracy}
        isDegraded={isDegraded}
        onStart={handleStart}
        onPause={gpsPause}
        onResume={gpsResume}
        onStop={handleStop}
        onWaypoint={handleWaypoint}
        hazardSlot={isRecording ? <HazardButton onOpenSheet={handleOpenHazardSheet} renderSheet={false} /> : null}
      />

      <HazardPickerSheet
        ref={hazardSheetRef}
        onConfirm={handleHazardConfirm}
        onDismiss={() => hazardSheetRef.current?.close()}
      />

      {activeWaypointId && (
        <VoiceAnnotationSheet
          ref={voiceSheetRef}
          waypointLocalId={activeWaypointId}
          onSave={({ transcript, audioUri, uploadedKey }) => {
            store.updatePendingWaypoint(activeWaypointId, {
              audioLabel: transcript || null,
              audioAnnotationUri: audioUri,
            });
            // uploadedKey stored as annotation URI for ALP-953 to finalize path
            if (uploadedKey) {
              store.updatePendingWaypoint(activeWaypointId, {
                audioAnnotationUri: uploadedKey,
              });
            }
            voiceSheetRef.current?.close();
            setActiveWaypointId(null);
          }}
          onDismiss={() => {
            voiceSheetRef.current?.close();
            setActiveWaypointId(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Map marker sub-components ─────────────────────────────────────────────────

const WaypointDot = React.memo(function WaypointDot({ color, label }: { color: string; label: string }) {
  return (
    <View
      style={[styles.markerDot, { backgroundColor: color, borderColor: '#fff' }]}
      accessible
      accessibilityLabel={`Waypoint: ${label}`}
    />
  );
});

const HazardDot = React.memo(function HazardDot({ color, label }: { color: string; label: string }) {
  return (
    <View
      style={styles.hazardMarker}
      accessible
      accessibilityLabel={`Hazard: ${label}`}
    >
      <View style={styles.hazardLabelChip}>
        <Text style={styles.hazardLabelText}>{label}</Text>
      </View>
      <View style={[styles.markerDot, styles.hazardDot, { backgroundColor: color }]}>
        <Text style={styles.hazardIcon}>!</Text>
      </View>
    </View>
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  map: { flex: 1 },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  hazardDot: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  hazardMarker: {
    alignItems: 'center',
    gap: 6,
    transform: [{ translateY: -24 }],
  },
  hazardLabelChip: {
    backgroundColor: '#111116ee',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  hazardLabelText: {
    color: '#F0F0F5',
    fontSize: 11,
    fontWeight: '700',
  },
  hazardIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    transform: [{ rotate: '-45deg' }],
  },
});
