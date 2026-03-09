/**
 * ALP-949: Bottom bar for the Walk-and-Record screen.
 *
 * Stateless: drives entirely from props. State machine is owned by
 * useRecordingStore via the parent screen.
 *
 * `hazardSlot` is intentionally untyped so ALP-952 can inject
 * HazardButton without this file knowing about it.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecordingState } from '@echoecho/shared';

import { GpsAccuracyIndicator } from './GpsAccuracyIndicator';

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

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecordingBottomBarProps {
  recordingState: RecordingState | null;
  elapsedMs: number;
  distanceMeters: number;
  gpsAccuracy: number | null;
  isDegraded: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onWaypoint: () => void;
  /** ALP-952 injects HazardButton here without modifying this component */
  hazardSlot?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecordingBottomBar({
  recordingState,
  elapsedMs,
  distanceMeters,
  gpsAccuracy,
  isDegraded,
  onStart,
  onPause,
  onResume,
  onStop,
  onWaypoint,
  hazardSlot,
}: RecordingBottomBarProps) {
  const isIdle      = recordingState === null;
  const isRecording = recordingState === 'recording';
  const isPaused    = recordingState === 'paused';
  const hasStarted  = !isIdle;

  return (
    <View style={styles.container}>
      {/* Stats bar — only visible after recording starts */}
      {hasStarted && (
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={13} color="#8888aa" />
            <Text
              style={styles.statValue}
              accessibilityLabel={`Elapsed time: ${formatElapsed(elapsedMs)}`}
            >
              {formatElapsed(elapsedMs)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="footsteps-outline" size={13} color="#8888aa" />
            <Text
              style={styles.statValue}
              accessibilityLabel={`Distance: ${formatDistance(distanceMeters)}`}
            >
              {formatDistance(distanceMeters)}
            </Text>
          </View>
          <GpsAccuracyIndicator accuracy={gpsAccuracy} isDegraded={isDegraded} />
        </View>
      )}

      {/* Main action buttons */}
      <View style={styles.buttonRow}>
        {isIdle && (
          <RecordBtn
            icon="radio-button-on"
            label="Start Recording"
            color="#e53e3e"
            onPress={onStart}
          />
        )}

        {isRecording && (
          <>
            <RecordBtn
              icon="pause"
              label="Pause Recording"
              color="#ed8936"
              onPress={onPause}
            />
            <RecordBtn
              icon="flag"
              label="Mark Waypoint"
              color="#6c63ff"
              onPress={onWaypoint}
            />
            {/* Hazard button injected by ALP-952 */}
            {hazardSlot}
          </>
        )}

        {isPaused && (
          <RecordBtn
            icon="play"
            label="Resume Recording"
            color="#48bb78"
            onPress={onResume}
          />
        )}

        {hasStarted && (
          <RecordBtn
            icon="stop"
            label="Stop Recording"
            color="#2a2a3e"
            onPress={onStop}
          />
        )}
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RecordBtn({
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
      style={({ pressed }) => [styles.btn, { backgroundColor: color }, pressed && styles.btnPressed]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#e8e8f0',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
    minHeight: 56,
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.75 },
  btnLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
