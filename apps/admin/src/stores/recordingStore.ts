import { create } from 'zustand';
import type { RecordingSession, TrackPoint, PendingWaypoint, PendingHazard } from '@echoecho/shared';

interface RecordingStore {
  session: RecordingSession | null;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  appendTrackPoint: (point: TrackPoint) => void;
  addPendingWaypoint: (waypoint: PendingWaypoint) => void;
  addPendingHazard: (hazard: PendingHazard) => void;
  updateSessionMeta: (fromLabel: string, toLabel: string, campusId: string) => void;
}

function createSessionId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  session: null,

  startRecording: () => {
    const existing = get().session;
    if (existing?.state === 'recording') return;

    set({
      session: {
        localId: createSessionId(),
        campusId: '',
        fromLabel: '',
        toLabel: '',
        state: 'recording',
        trackPoints: [],
        pendingWaypoints: [],
        pendingHazards: [],
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedMs: 0,
      },
    });
  },

  pauseRecording: () => {
    const s = get().session;
    if (!s || s.state !== 'recording') return;
    set({ session: { ...s, state: 'paused', pausedAt: Date.now() } });
  },

  resumeRecording: () => {
    const s = get().session;
    if (!s || s.state !== 'paused') return;
    const pausedMs = s.pausedAt ? Date.now() - s.pausedAt : 0;
    set({
      session: {
        ...s,
        state: 'recording',
        pausedAt: null,
        totalPausedMs: s.totalPausedMs + pausedMs,
      },
    });
  },

  stopRecording: () => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, state: 'complete' } });
  },

  appendTrackPoint: (point) => {
    const s = get().session;
    if (!s || s.state !== 'recording') return;
    set({ session: { ...s, trackPoints: [...s.trackPoints, point] } });
  },

  addPendingWaypoint: (waypoint) => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, pendingWaypoints: [...s.pendingWaypoints, waypoint] },
    });
  },

  addPendingHazard: (hazard) => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, pendingHazards: [...s.pendingHazards, hazard] },
    });
  },

  updateSessionMeta: (fromLabel, toLabel, campusId) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, fromLabel, toLabel, campusId } });
  },
}));
