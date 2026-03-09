/**
 * Tests for routeSaveService (ALP-953).
 *
 * Supabase and FileSystem are mocked via jest.mock(). Because jest.mock factories
 * are hoisted above variable declarations, all mock configuration happens in
 * beforeEach by reaching into the mocked modules.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import * as FileSystem from 'expo-file-system';

import {
  saveRoute,
  publishRoute,
  retractRoute,
  type RouteSaveMetadata,
} from '../routeSaveService';
import type { RecordingSession, PendingWaypoint } from '@echoecho/shared';

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockRpc            = supabase.rpc as jest.Mock;
const mockStorageFrom    = supabase.storage.from as jest.Mock;
const mockReadFile       = FileSystem.readAsStringAsync as jest.Mock;

// Storage bucket sub-methods, recreated in beforeEach
let mockUpload: jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    localId:          'session-1',
    campusId:         'campus-uuid',
    fromLabel:        'Main Hall',
    toLabel:          'Gym',
    state:            'complete',
    trackPoints: [
      {
        sequenceIndex: 0,
        latitude:       30.349,
        longitude:      -97.746,
        altitude:       200,
        accuracy:       5,
        altitudeAccuracy: 3,
        heading:        90,
        speed:          1.2,
        timestamp:      1_000_000,
      },
      {
        sequenceIndex: 1,
        latitude:       30.350,
        longitude:      -97.747,
        altitude:       201,
        accuracy:       4,
        altitudeAccuracy: 2,
        heading:        92,
        speed:          1.4,
        timestamp:      1_001_000,
      },
    ],
    pendingWaypoints: [],
    pendingHazards:   [],
    startedAt:        1_000_000,
    pausedAt:         null,
    totalPausedMs:    0,
    ...overrides,
  };
}

function makeWaypoint(overrides: Partial<PendingWaypoint> = {}): PendingWaypoint {
  return {
    localId:            'wp-1',
    coordinate:         { latitude: 30.349, longitude: -97.746, altitude: 200 },
    type:               'turn',
    audioLabel:         null,
    description:        null,
    photoUri:           null,
    audioAnnotationUri: null,
    capturedAt:         1_000_500,
    ...overrides,
  };
}

const METADATA: RouteSaveMetadata = {
  name:            'Main Hall to Gym',
  startBuildingId: 'building-start',
  endBuildingId:   'building-end',
  difficulty:      'easy',
  tags:            ['indoor'],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockUpload = jest.fn().mockResolvedValue({ error: null });

  mockStorageFrom.mockReturnValue({
    upload: mockUpload,
  });

  mockRpc.mockResolvedValue({ data: 'route-uuid-returned', error: null });
  mockReadFile.mockResolvedValue('base64data==');

  // atob polyfill for Node environments that lack it
  if (typeof global.atob === 'undefined') {
    global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  }
});

// ── Tests: saveRoute ──────────────────────────────────────────────────────────

describe('saveRoute', () => {
  it('calls save_route RPC on success', async () => {
    const result = await saveRoute(makeSession(), METADATA, jest.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.routeId).toBe('route-uuid-returned');
    }
    expect(mockRpc).toHaveBeenCalledWith('save_route', expect.objectContaining({
      p_campus_id:  'campus-uuid',
      p_name:       'Main Hall to Gym',
      p_difficulty: 'easy',
      p_tags:       ['indoor'],
    }));
  });

  it('auto-injects start and end waypoints from track points when none exist', async () => {
    await saveRoute(makeSession(), METADATA, jest.fn());

    const payload = mockRpc.mock.calls[0][1].p_waypoints as Array<{ annotation_text: string | null }>;
    expect(payload.length).toBeGreaterThanOrEqual(2);
    expect(payload[0].annotation_text).toBe('Start');
    expect(payload[payload.length - 1].annotation_text).toBe('End');
  });

  it('does not inject auto waypoints when explicit start/end exist', async () => {
    const session = makeSession({
      pendingWaypoints: [
        makeWaypoint({ localId: 'wp-start', type: 'start', capturedAt: 999_000 }),
        makeWaypoint({ localId: 'wp-end',   type: 'end',   capturedAt: 1_002_000 }),
      ],
    });

    await saveRoute(session, METADATA, jest.fn());

    const payload = mockRpc.mock.calls[0][1].p_waypoints as unknown[];
    // Only the two explicit waypoints; no auto-generated ones
    expect(payload).toHaveLength(2);
  });

  it('calls onStageChange in order: uploading_audio → uploading_photos → saving_to_database', async () => {
    const stages: string[] = [];
    await saveRoute(makeSession(), METADATA, (s) => stages.push(s));

    expect(stages).toEqual([
      'uploading_audio',
      'uploading_photos',
      'saving_to_database',
    ]);
  });

  it('uploads local audio URI before calling RPC', async () => {
    const session = makeSession({
      pendingWaypoints: [makeWaypoint({ audioAnnotationUri: 'file:///local/audio.m4a' })],
    });

    await saveRoute(session, METADATA, jest.fn());

    expect(mockReadFile).toHaveBeenCalledWith('file:///local/audio.m4a', expect.any(Object));
    expect(mockUpload).toHaveBeenCalledWith(
      'pending/wp-1.m4a',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'audio/mp4' }),
    );
    expect(mockRpc).toHaveBeenCalled();
  });

  it('uploads local photo URI before calling RPC', async () => {
    const session = makeSession({
      pendingWaypoints: [makeWaypoint({ photoUri: 'file:///local/photo.jpg' })],
    });

    await saveRoute(session, METADATA, jest.fn());

    expect(mockUpload).toHaveBeenCalledWith(
      'pending/wp-1.jpg',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(mockRpc).toHaveBeenCalled();
  });

  it('resolves existing storage key without re-uploading', async () => {
    const session = makeSession({
      pendingWaypoints: [makeWaypoint({ audioAnnotationUri: 'pending/wp-1.m4a' })],
    });

    await saveRoute(session, METADATA, jest.fn());

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalled();
  });

  it('returns stage=upload_audio and does not call RPC when audio upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'Network timeout' } });

    const session = makeSession({
      pendingWaypoints: [makeWaypoint({ audioAnnotationUri: 'file:///local/audio.m4a' })],
    });

    const result = await saveRoute(session, METADATA, jest.fn());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('upload_audio');
      expect(result.error).toContain('Network timeout');
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns stage=upload_photo and does not call RPC when photo upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'Storage quota exceeded' } });

    const session = makeSession({
      pendingWaypoints: [makeWaypoint({ photoUri: 'file:///local/photo.jpg' })],
    });

    const result = await saveRoute(session, METADATA, jest.fn());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('upload_photo');
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns stage=db when save_route RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Postgres constraint violation' } });

    const result = await saveRoute(makeSession(), METADATA, jest.fn());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('db');
      expect(result.error).toContain('Postgres constraint violation');
    }
  });

  it('passes recorded duration in seconds to the RPC', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt:     now - 90_000,
      totalPausedMs: 10_000,
    });

    await saveRoute(session, METADATA, jest.fn());

    const durationArg = mockRpc.mock.calls[0][1].p_recorded_duration_sec as number;
    // ~80 seconds; allow ±2 for test timing jitter
    expect(durationArg).toBeGreaterThanOrEqual(78);
    expect(durationArg).toBeLessThanOrEqual(82);
  });
});

// ── Tests: publishRoute / retractRoute ────────────────────────────────────────

describe('publishRoute', () => {
  it('calls publish_route RPC with the route ID', async () => {
    const result = await publishRoute('some-route-id');

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('publish_route', { route_id: 'some-route-id' });
  });

  it('returns ok:false when RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'permission_denied' } });

    const result = await publishRoute('some-route-id');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('permission_denied');
    }
  });
});

describe('retractRoute', () => {
  it('calls retract_route RPC with the route ID', async () => {
    const result = await retractRoute('some-route-id');

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('retract_route', { route_id: 'some-route-id' });
  });

  it('returns ok:false when RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const result = await retractRoute('some-route-id');

    expect(result.ok).toBe(false);
  });
});
