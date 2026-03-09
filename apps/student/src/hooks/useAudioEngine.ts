/**
 * Audio announcement engine for navigation (ALP-959).
 *
 * Architecture: Path A — AccessibilityInfo.announceForAccessibility for all
 * spoken navigation text (routes through VoiceOver/TalkBack, avoids audio
 * session conflicts). expo-av used exclusively for recorded waypoint clips
 * from ALP-950 (Supabase Storage).
 *
 * expo-speech is NOT used anywhere in this hook.
 *
 * Priority queue (highest first):
 *   1. off_route
 *   2. turn (at_waypoint)
 *   3. waypoint_annotation (recorded clip)
 *   4. pdr_accuracy_warning
 *   5. route start / arrived
 *
 * Distance in turn announcements is computed at playback time from the
 * current GPS position snapshot (ALP-956's lastPositionRef), not at event
 * emission time, to account for 1Hz GPS update lag (~1.4m per update).
 */
import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Audio } from 'expo-av';
import type { NavEvent } from '../types/navEvents';
import type { TrackPositionUpdate } from '../types/navEvents';
import { haversineM } from '@echoecho/shared';
import type { LocalWaypoint } from '../lib/localDb';

// ── Priority levels ───────────────────────────────────────────────────────────

const PRIORITY = {
  off_route: 1,
  turn: 2,
  waypoint_annotation: 3,
  pdr_warning: 4,
  route_event: 5,
} as const;

type Priority = typeof PRIORITY[keyof typeof PRIORITY];

interface QueueItem {
  priority: Priority;
  text?: string;
  clipUri?: string;
  enqueuedAt: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseAudioEngineResult {
  onNavEvent: (event: NavEvent) => void;
  /** Provide current position ref for playback-time distance computation. */
  setPositionRef: (ref: React.MutableRefObject<TrackPositionUpdate | null>) => void;
  /** Provide waypoints so the engine can look up annotation text. */
  setWaypoints: (waypoints: LocalWaypoint[]) => void;
  /** Provide a clip URL resolver: waypointId → Supabase Storage URL. */
  setClipUrlResolver: (fn: (waypointId: string) => string | undefined) => void;
}

export function useAudioEngine(): UseAudioEngineResult {
  const queueRef = useRef<QueueItem[]>([]);
  const playingRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  // Clip file cache: waypointId → local file URI (expo-av loads from URI)
  const clipCacheRef = useRef<Map<string, string>>(new Map());
  const positionRef = useRef<React.MutableRefObject<TrackPositionUpdate | null> | null>(null);
  const waypointsRef = useRef<LocalWaypoint[]>([]);
  const clipUrlResolverRef = useRef<((id: string) => string | undefined) | null>(null);
  const audioSessionConfiguredRef = useRef(false);

  // Release native audio resources on unmount to prevent AVPlayer/MediaPlayer leaks
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => undefined);
        soundRef.current = null;
      }
    };
  }, []);

  const configureAudioSession = useCallback(async () => {
    if (audioSessionConfiguredRef.current) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        allowsRecordingIOS: false,
      });
      audioSessionConfiguredRef.current = true;
    } catch {
      // Non-fatal; fallback to AccessibilityInfo only
    }
  }, []);

  const playClip = useCallback(async (uri: string) => {
    await configureAudioSession();
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      await sound.playAsync();
      // Wait for clip to finish
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) resolve();
        });
      });
    } catch {
      // Clip playback failed — caller will use AccessibilityInfo fallback
      throw new Error('clip_playback_failed');
    }
  }, [configureAudioSession]);

  const announce = useCallback(async (item: QueueItem) => {
    if (item.clipUri) {
      try {
        await playClip(item.clipUri);
        return;
      } catch {
        // Fall through to accessibility announcement
      }
    }
    if (item.text) {
      AccessibilityInfo.announceForAccessibility(item.text);
    }
  }, [playClip]);

  const drainQueue = useCallback(async () => {
    if (playingRef.current || queueRef.current.length === 0) return;
    playingRef.current = true;
    // Pop highest priority (lowest number)
    queueRef.current.sort((a, b) => a.priority - b.priority);
    const item = queueRef.current.shift()!;
    await announce(item);
    playingRef.current = false;
    void drainQueue();
  }, [announce]);

  const enqueue = useCallback((item: QueueItem, preempt = false) => {
    if (preempt) {
      // Stop current playback
      soundRef.current?.stopAsync().catch(() => undefined);
      queueRef.current = [item];
      playingRef.current = false;
    } else {
      // Remove any existing item with same or lower priority if queue is long
      if (queueRef.current.length > 3) {
        queueRef.current = queueRef.current.filter(q => q.priority < item.priority);
      }
      queueRef.current.push(item);
    }
    void drainQueue();
  }, [drainQueue]);

  /** Distance from current GPS position to the given waypoint. */
  const currentDistToWaypoint = useCallback((waypointId: string): number | null => {
    const pos = positionRef.current?.current;
    if (!pos) return null;
    const wp = waypointsRef.current.find(w => w.id === waypointId);
    if (!wp) return null;
    return haversineM(pos.lat, pos.lng, wp.lat, wp.lng);
  }, []);

  const getClipUri = useCallback(async (waypointId: string): Promise<string | null> => {
    if (clipCacheRef.current.has(waypointId)) {
      return clipCacheRef.current.get(waypointId)!;
    }
    const url = clipUrlResolverRef.current?.(waypointId);
    if (!url) return null;
    // Cache the Supabase Storage URL directly; expo-av can load from https
    clipCacheRef.current.set(waypointId, url);
    return url;
  }, []);

  const onNavEvent = useCallback(async (event: NavEvent) => {
    switch (event.type) {
      case 'off_route': {
        const dist = Math.round(event.deviationMeters);
        enqueue({
          priority: PRIORITY.off_route,
          text: `You are off route, ${dist} meters from the path.`,
          enqueuedAt: Date.now(),
        }, true);
        break;
      }

      case 'approaching_waypoint': {
        const dist = currentDistToWaypoint(event.waypointId) ?? Math.round(event.distanceMeters);
        const roundedDist = Math.round(dist);
        enqueue({
          priority: PRIORITY.turn,
          text: `Approaching waypoint in ${roundedDist} meters.`,
          enqueuedAt: Date.now(),
        });
        break;
      }

      case 'at_waypoint': {
        const dirText: Record<string, string> = {
          left: 'Turn left.',
          right: 'Turn right.',
          straight: 'Continue straight.',
          arrived: 'You have arrived at your destination.',
        };
        const text = dirText[event.turnDirection] ?? 'Continue.';

        // Try to play recorded clip for this waypoint
        const clipUri = await getClipUri(event.waypointId);
        enqueue({
          priority: PRIORITY.waypoint_annotation,
          text,
          clipUri: clipUri ?? undefined,
          enqueuedAt: Date.now(),
        });
        // Follow-up text announcement only when a clip will play first.
        // Without a clip, the first enqueue's text fallback already covers
        // the direction. Enqueueing both produces duplicate speech.
        if (clipUri && event.turnDirection !== 'arrived') {
          enqueue({
            priority: PRIORITY.turn,
            text,
            enqueuedAt: Date.now(),
          });
        }
        break;
      }

      case 'arrived': {
        enqueue({
          priority: PRIORITY.route_event,
          text: 'You have arrived at your destination.',
          enqueuedAt: Date.now(),
        });
        break;
      }

      case 'pdr_accuracy_warning': {
        enqueue({
          priority: PRIORITY.pdr_warning,
          text: 'GPS signal lost. Position estimate may be less accurate.',
          enqueuedAt: Date.now(),
        });
        break;
      }

      case 'position_degraded': {
        // Low-level event; no announcement by default (ALP-957 emits pdr_accuracy_warning)
        break;
      }

      default:
        break;
    }
  }, [enqueue, currentDistToWaypoint, getClipUri]);

  const setPositionRef = useCallback(
    (ref: React.MutableRefObject<TrackPositionUpdate | null>) => {
      positionRef.current = ref;
    }, []
  );

  const setWaypoints = useCallback((waypoints: LocalWaypoint[]) => {
    waypointsRef.current = waypoints;
    clipCacheRef.current.clear();
  }, []);

  const setClipUrlResolver = useCallback((fn: (id: string) => string | undefined) => {
    clipUrlResolverRef.current = fn;
  }, []);

  return { onNavEvent, setPositionRef, setWaypoints, setClipUrlResolver };
}
