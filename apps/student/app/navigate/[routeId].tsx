/**
 * Active navigation screen.
 *
 * This screen coordinates between the GPS service (ALP-956, mobile-engineer),
 * the haptic engine (ALP-958, mobile-engineer), and the TTS service (ALP-959,
 * mobile-engineer). The frontend owns:
 *   - The navigation UI state machine
 *   - Turn instruction display
 *   - Off-route state presentation
 *   - Arrival confirmation
 *
 * Accessibility: the navigation experience is designed to be operable with eyes
 * closed. Visual elements are supplementary — VoiceOver/TalkBack must deliver all
 * navigation information.
 */
import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigationStore } from '../../src/stores/navigationStore';

export default function NavigateScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const { currentSession, endNavigation } = useNavigationStore();

  useEffect(() => {
    // ALP-956: GPS tracking service starts here (mobile-engineer)
    // ALP-958: Haptic engine starts here (mobile-engineer)
    AccessibilityInfo.announceForAccessibility('Navigation started. Follow the audio instructions.');

    return () => {
      // Cleanup navigation services on unmount
    };
  }, [routeId]);

  const handleEndNavigation = useCallback(() => {
    endNavigation();
    router.back();
  }, [endNavigation]);

  const status = currentSession?.status ?? 'navigating';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Status indicator */}
      <StatusBar status={status} />

      {/* Current instruction */}
      <View style={styles.instructionArea} accessibilityLiveRegion="polite">
        <CurrentInstruction session={currentSession} />
      </View>

      {/* Progress */}
      <View style={styles.progressArea}>
        <RouteProgress session={currentSession} />
      </View>

      {/* End navigation */}
      <Pressable
        style={({ pressed }) => [styles.endBtn, pressed && styles.endBtnPressed]}
        onPress={handleEndNavigation}
        accessibilityLabel="End navigation"
        accessibilityRole="button"
        accessibilityHint="Double tap to stop navigation and return home"
      >
        <Ionicons name="stop-circle" size={24} color="#fff" />
        <Text style={styles.endBtnLabel}>End Navigation</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function StatusBar({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    navigating: { color: '#22c55e', label: 'Navigating' },
    off_route: { color: '#f97316', label: 'Off Route — Rerouting' },
    arrived: { color: '#6c63ff', label: 'Arrived' },
    searching: { color: '#eab308', label: 'Finding position...' },
    emergency: { color: '#ef4444', label: 'Emergency Mode' },
    idle: { color: '#8888aa', label: 'Ready' },
  };
  const { color, label } = config[status] ?? config['idle'];

  return (
    <View style={[styles.statusBar, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text
        style={[styles.statusLabel, { color }]}
        accessibilityRole="none"
        accessibilityLabel={`Navigation status: ${label}`}
      >
        {label}
      </Text>
    </View>
  );
}

function CurrentInstruction({
  session,
}: {
  session: ReturnType<typeof useNavigationStore>['currentSession'];
}) {
  if (!session) {
    return (
      <View style={styles.instructionCard}>
        <Text style={styles.instructionText}>Waiting for GPS signal...</Text>
      </View>
    );
  }

  const status = session.status;

  if (status === 'arrived') {
    return (
      <View style={styles.instructionCard}>
        <Ionicons name="checkmark-circle" size={80} color="#6c63ff" />
        <Text style={styles.arrivedText}>You have arrived!</Text>
        <Text style={styles.arrivedSubtext}>{session.route.toLabel}</Text>
      </View>
    );
  }

  const nextWaypoint =
    session.route.waypoints[session.currentWaypointIndex] ?? null;
  const directionText = nextWaypoint?.audioLabel ?? 'Continue ahead';

  return (
    <View style={styles.instructionCard}>
      <Text style={styles.instructionText} accessibilityLabel={directionText}>
        {directionText}
      </Text>
      {session.distanceToNextWaypoint != null && (
        <Text style={styles.distanceText}>
          {Math.round(session.distanceToNextWaypoint)} m
        </Text>
      )}
    </View>
  );
}

function RouteProgress({
  session,
}: {
  session: ReturnType<typeof useNavigationStore>['currentSession'];
}) {
  if (!session) return null;

  const total = session.route.waypoints.length;
  const current = session.currentWaypointIndex;
  const progress = total > 0 ? current / total : 0;

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>
          Waypoint {current + 1} of {total}
        </Text>
        <Text style={styles.destinationLabel} numberOfLines={1}>
          → {session.route.toLabel}
        </Text>
      </View>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
    padding: 16,
    gap: 16,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#14142a',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  instructionArea: {
    flex: 1,
    justifyContent: 'center',
  },
  instructionCard: {
    backgroundColor: '#14142a',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  instructionText: {
    color: '#e0e0f8',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  distanceText: {
    color: '#6c63ff',
    fontSize: 36,
    fontWeight: '900',
  },
  arrivedText: {
    color: '#a5b4fc',
    fontSize: 32,
    fontWeight: '900',
  },
  arrivedSubtext: {
    color: '#7070aa',
    fontSize: 18,
    textAlign: 'center',
  },
  progressArea: {},
  progressCard: {
    backgroundColor: '#14142a',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    color: '#9090cc',
    fontSize: 13,
    fontWeight: '600',
  },
  destinationLabel: {
    color: '#c0c0e8',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#2a2a4e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#6c63ff',
    borderRadius: 3,
  },
  endBtn: {
    backgroundColor: '#3a0a0a',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  endBtnPressed: { opacity: 0.8 },
  endBtnLabel: {
    color: '#fca5a5',
    fontSize: 17,
    fontWeight: '700',
  },
});
