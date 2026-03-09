/**
 * Walk-and-Record screen.
 *
 * The GPS track recording service (ALP-947) and waypoint detection (ALP-948) are
 * mobile-engineer owned. This file owns the recording UI:
 *   - Live map with growing polyline
 *   - Controls: start / pause / stop
 *   - Waypoint annotation sheet (ALP-949)
 *   - Hazard marking (ALP-952)
 *
 * State lives in recordingStore. Service hooks live in src/hooks/.
 */
import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';

import { MAPBOX_STYLE_SATELLITE } from '../src/lib/mapbox';
import { useRecordingStore } from '../src/stores/recordingStore';

const TSBVI_CENTER: [number, number] = [-97.7468, 30.3495];

export default function RecordScreen() {
  const { session, startRecording, pauseRecording, resumeRecording, stopRecording } =
    useRecordingStore();

  const handleStop = useCallback(() => {
    Alert.alert('Stop Recording', 'Save this route?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          stopRecording();
          router.back();
        },
      },
      {
        text: 'Save',
        onPress: () => {
          stopRecording();
          // ALP-953: route save flow — navigate to save form
          router.replace('/routes');
        },
      },
    ]);
  }, [stopRecording]);

  const isRecording = session?.state === 'recording';
  const isPaused = session?.state === 'paused';
  const hasStarted = session != null;
  const trackPoints = session?.trackPoints ?? [];

  // Build GeoJSON LineString for the live track
  const trackGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: trackPoints.map((p) => [p.longitude, p.latitude]),
    },
    properties: {},
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Live map */}
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MAPBOX_STYLE_SATELLITE}
        logoEnabled={false}
        attributionPosition={{ bottom: 8, right: 8 }}
      >
        <MapboxGL.Camera
          followUserLocation={isRecording}
          followZoomLevel={18}
          centerCoordinate={TSBVI_CENTER}
          zoomLevel={16}
          animationMode="flyTo"
          animationDuration={800}
        />

        <MapboxGL.UserLocation visible animated />

        {/* Live track polyline */}
        {trackPoints.length > 1 && (
          <MapboxGL.ShapeSource id="live-track" shape={trackGeoJSON}>
            <MapboxGL.LineLayer
              id="live-track-line"
              style={{
                lineColor: '#e53e3e',
                lineWidth: 3,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      {/* Recording controls */}
      <View style={styles.controls}>
        {/* Stats bar */}
        {hasStarted && (
          <View style={styles.stats}>
            <StatItem
              icon="location"
              value={`${trackPoints.length}`}
              label="pts"
            />
            {session?.pendingWaypoints != null && (
              <StatItem
                icon="flag"
                value={`${session.pendingWaypoints.length}`}
                label="wpts"
              />
            )}
          </View>
        )}

        {/* Main action buttons */}
        <View style={styles.buttonRow}>
          {!hasStarted && (
            <RecordButton
              icon="radio-button-on"
              label="Start Recording"
              color="#e53e3e"
              onPress={startRecording}
            />
          )}

          {isRecording && (
            <>
              <RecordButton
                icon="pause"
                label="Pause"
                color="#ed8936"
                onPress={pauseRecording}
              />
              <RecordButton
                icon="flag"
                label="Waypoint"
                color="#6c63ff"
                onPress={() => {/* ALP-949: opens annotation sheet */}}
              />
              <RecordButton
                icon="warning"
                label="Hazard"
                color="#e53e3e"
                onPress={() => {/* ALP-952: opens hazard sheet */}}
              />
            </>
          )}

          {isPaused && (
            <>
              <RecordButton
                icon="play"
                label="Resume"
                color="#48bb78"
                onPress={resumeRecording}
              />
            </>
          )}

          {hasStarted && (
            <RecordButton
              icon="stop"
              label="Stop"
              color="#2a2a3e"
              onPress={handleStop}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function RecordButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.recordBtn,
        { backgroundColor: color },
        pressed && styles.recordBtnPressed,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={24} color="#fff" />
      <Text style={styles.recordBtnLabel}>{label}</Text>
    </Pressable>
  );
}

function StatItem({
  icon,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={14} color="#8888aa" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  map: { flex: 1 },
  controls: {
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
    justifyContent: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: { color: '#e8e8f0', fontSize: 14, fontWeight: '700' },
  statLabel: { color: '#8888aa', fontSize: 12 },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  recordBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
    justifyContent: 'center',
  },
  recordBtnPressed: { opacity: 0.8 },
  recordBtnLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
