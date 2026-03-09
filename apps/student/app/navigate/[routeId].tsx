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
import { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigationStore } from '../../src/stores/navigationStore';
import { useGpsNavigation } from '../../src/hooks/useGpsNavigation';
import { usePdrNavigation } from '../../src/hooks/usePdrNavigation';
import { useHapticEngine } from '../../src/hooks/useHapticEngine';
import { useAudioEngine } from '../../src/hooks/useAudioEngine';
import { useOffRouteDetection } from '../../src/hooks/useOffRouteDetection';
import { getOrderedWaypoints } from '../../src/lib/localDb';
import type { NavEvent } from '../../src/types/navEvents';
import { INACTIVE_STT_SESSION, type NavigationStatus } from '@echoecho/shared';

export default function NavigateScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const { currentSession, endNavigation } = useNavigationStore();
  const [navStatus, setNavStatus] = useState<NavigationStatus>('searching');
  const [currentInstruction, setCurrentInstruction] = useState('Acquiring GPS signal...');
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [waypointProgress, setWaypointProgress] = useState({ current: 0, total: 0 });
  const [positioningMode, setPositioningMode] = useState<'gps' | 'pdr'>('gps');

  // ALP-956: GPS position tracking
  const gps = useGpsNavigation();

  // ALP-957: PDR fallback
  const pdr = usePdrNavigation(gps.injectPosition);

  // ALP-958: Haptic feedback engine. STT is never active during navigation,
  // so we pass the static inactive session to satisfy the haptic mutex contract.
  const haptic = useHapticEngine(INACTIVE_STT_SESSION);

  // ALP-959: Audio announcement engine
  const audio = useAudioEngine();

  // ALP-960: Off-route detection (bridges haptic + audio)
  const offRoute = useOffRouteDetection(
    haptic.onNavEvent,
    async (event: NavEvent) => audio.onNavEvent(event)
  );

  // Central event handler: distributes NavEvents to all downstream consumers
  const handleNavEvent = useCallback((event: NavEvent) => {
    switch (event.type) {
      case 'approaching_waypoint':
        haptic.onNavEvent(event);
        void audio.onNavEvent(event);
        setDistanceToNext(event.distanceMeters);
        setCurrentInstruction(`Approaching waypoint in ${Math.round(event.distanceMeters)} meters`);
        break;

      case 'at_waypoint': {
        haptic.onNavEvent(event);
        void audio.onNavEvent(event);
        offRoute.onNavEvent(event);
        setWaypointProgress((prev) => ({ ...prev, current: prev.current + 1 }));
        const dirText: Record<string, string> = {
          left: 'Turn left',
          right: 'Turn right',
          straight: 'Continue straight',
          arrived: 'You have arrived',
        };
        setCurrentInstruction(dirText[event.turnDirection] ?? 'Continue');
        setDistanceToNext(null);
        break;
      }

      case 'arrived':
        haptic.onNavEvent(event);
        void audio.onNavEvent(event);
        offRoute.onNavEvent(event);
        setNavStatus('arrived');
        setCurrentInstruction('You have arrived at your destination');
        break;

      case 'off_route':
        offRoute.onNavEvent(event);
        setNavStatus('off_route');
        setCurrentInstruction(`Off route by ${Math.round(event.deviationMeters)} meters`);
        break;

      case 'position_degraded':
        void audio.onNavEvent(event);
        setPositioningMode('pdr');
        if (gps.lastPositionRef.current) {
          const pos = gps.lastPositionRef.current;
          pdr.activate(pos.lat, pos.lng, pos.heading);
          offRoute.setIsPDRActive(true);
        }
        break;

      case 'position_restored':
        setPositioningMode('gps');
        if (gps.lastPositionRef.current) {
          pdr.reanchor(gps.lastPositionRef.current.lat, gps.lastPositionRef.current.lng);
        }
        pdr.deactivate();
        offRoute.setIsPDRActive(false);
        if (navStatus === 'off_route') setNavStatus('navigating');
        break;

      case 'pdr_accuracy_warning':
        void audio.onNavEvent(event);
        break;
    }
  }, [haptic, audio, offRoute, pdr, gps.lastPositionRef, navStatus]);

  // Stable ref that always points to the latest handleNavEvent.
  // startTracking receives a wrapper that delegates through this ref,
  // so the GPS callback always runs the current closure without
  // needing to restart tracking when dependencies change.
  const handleNavEventRef = useRef(handleNavEvent);
  useEffect(() => {
    handleNavEventRef.current = handleNavEvent;
  }, [handleNavEvent]);

  // Wire PDR event handler (emits pdr_accuracy_warning through handleNavEvent)
  useEffect(() => {
    pdr.onNavEvent(handleNavEvent);
  }, [pdr, handleNavEvent]);

  // Wire audio engine position ref for playback-time distance computation
  useEffect(() => {
    audio.setPositionRef(gps.lastPositionRef);
  }, [audio, gps.lastPositionRef]);

  // Wire off-route position ref
  useEffect(() => {
    offRoute.setPositionRef(gps.lastPositionRef);
  }, [offRoute, gps.lastPositionRef]);

  // Start navigation on mount: load waypoints from local DB, start GPS tracking.
  // The stable ref wrapper ensures gps.startTracking always dispatches to
  // the latest handleNavEvent without restarting the GPS subscription.
  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;

    const dispatchNavEvent = (event: NavEvent) => handleNavEventRef.current(event);

    const startNavigation = async () => {
      const waypoints = await getOrderedWaypoints(routeId);
      if (cancelled || waypoints.length === 0) return;

      setWaypointProgress({ current: 0, total: waypoints.length });
      audio.setWaypoints(waypoints);
      setNavStatus('navigating');

      await gps.startTracking(waypoints, dispatchNavEvent);
      AccessibilityInfo.announceForAccessibility(
        'Navigation started. Follow the audio instructions.'
      );
    };

    void startNavigation();

    return () => {
      cancelled = true;
      gps.stopTracking();
      pdr.deactivate();
    };
  }, [routeId, audio, gps, pdr]);

  // Announce haptic skip reasons to screen reader users
  useEffect(() => {
    haptic.onHapticSkipped((reason) => {
      if (reason === 'low_power') {
        AccessibilityInfo.announceForAccessibility(
          'Haptic feedback unavailable in Low Power Mode. Audio guidance continues.'
        );
      }
    });
  }, [haptic]);

  const handleEndNavigation = useCallback(() => {
    gps.stopTracking();
    pdr.deactivate();
    endNavigation();
    router.back();
  }, [endNavigation, gps, pdr]);

  const status = navStatus;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Status indicator */}
      <StatusBar status={status} positioningMode={positioningMode} />

      {/* Current instruction */}
      <View style={styles.instructionArea} accessibilityLiveRegion="polite">
        <InstructionCard
          status={status}
          instruction={currentInstruction}
          distance={distanceToNext}
          destination={currentSession?.route.toLabel ?? ''}
        />
      </View>

      {/* Progress */}
      <View style={styles.progressArea}>
        <ProgressCard
          current={waypointProgress.current}
          total={waypointProgress.total}
          destination={currentSession?.route.toLabel ?? ''}
        />
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

function StatusBar({
  status,
  positioningMode,
}: {
  status: NavigationStatus;
  positioningMode: 'gps' | 'pdr';
}) {
  const config: Record<string, { color: string; label: string }> = {
    navigating: { color: '#22c55e', label: 'Navigating' },
    off_route: { color: '#f97316', label: 'Off Route' },
    arrived: { color: '#6c63ff', label: 'Arrived' },
    searching: { color: '#eab308', label: 'Finding position...' },
    emergency: { color: '#ef4444', label: 'Emergency Mode' },
    idle: { color: '#8888aa', label: 'Ready' },
  };
  const { color, label } = config[status] ?? config['idle'];
  const modeLabel = positioningMode === 'pdr' ? ' (estimated position)' : '';

  return (
    <View style={[styles.statusBar, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text
        style={[styles.statusLabel, { color }]}
        accessibilityRole="none"
        accessibilityLabel={`Navigation status: ${label}${modeLabel}`}
      >
        {label}
      </Text>
      {positioningMode === 'pdr' && (
        <Ionicons name="cellular-outline" size={14} color="#eab308" />
      )}
    </View>
  );
}

function InstructionCard({
  status,
  instruction,
  distance,
  destination,
}: {
  status: NavigationStatus;
  instruction: string;
  distance: number | null;
  destination: string;
}) {
  if (status === 'arrived') {
    return (
      <View style={styles.instructionCard}>
        <Ionicons name="checkmark-circle" size={80} color="#6c63ff" />
        <Text style={styles.arrivedText}>You have arrived!</Text>
        <Text style={styles.arrivedSubtext}>{destination}</Text>
      </View>
    );
  }

  return (
    <View style={styles.instructionCard}>
      <Text style={styles.instructionText} accessibilityLabel={instruction}>
        {instruction}
      </Text>
      {distance != null && (
        <Text style={styles.distanceText}>
          {Math.round(distance)} m
        </Text>
      )}
    </View>
  );
}

function ProgressCard({
  current,
  total,
  destination,
}: {
  current: number;
  total: number;
  destination: string;
}) {
  if (total === 0) return null;
  const progress = current / total;

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>
          Waypoint {current + 1} of {total}
        </Text>
        <Text style={styles.destinationLabel} numberOfLines={1}>
          {destination}
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
