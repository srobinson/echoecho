/**
 * Local SQLite data layer for offline navigation (ALP-963).
 *
 * No ORM — raw SQL via expo-sqlite with typed wrappers. The dependency
 * surface is deliberately minimal for a safety-critical navigation layer.
 *
 * This module is the single source of truth for local route data. It is
 * called from two distinct paths:
 *   1. syncEngine.ts  — full campus sync on foreground resume
 *   2. routeMatchingService.ts — single-route pre-load on route selection
 *
 * Both paths call the same `upsertRoute` function to guarantee consistency.
 */

import * as SQLite from 'expo-sqlite';

// ── Types ──────────────────────────────────────────────────────────────────

export interface LocalRoute {
  id: string;
  campusId: string;
  name: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  tags: string[];
  status: 'published' | 'retracted';
  totalDistanceM: number | null;
  contentHash: string;
  syncedAt: number;
}

export interface LocalWaypoint {
  id: string;
  routeId: string;
  position: number;
  lat: number;
  lng: number;
  heading: number | null;
  annotationText: string | null;
  /** Local filesystem path. Null until cacheRouteMedia downloads the file. */
  annotationAudioPath: string | null;
  photoPath: string | null;
  hazardType: string | null;
}

export interface UpsertRouteInput {
  id: string;
  campusId: string;
  name: string;
  difficulty: string;
  tags: string[];
  status: string;
  totalDistanceM: number | null;
  contentHash: string;
}

export interface UpsertWaypointInput {
  id: string;
  position: number;
  lat: number;
  lng: number;
  heading: number | null;
  annotationText: string | null;
  hazardType: string | null;
}

// ── Database singleton ─────────────────────────────────────────────────────

const DB_NAME = 'echoecho.db';
let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _initSchema(_db);
  return _db;
}

async function _initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS local_routes (
      id               TEXT    PRIMARY KEY,
      campus_id        TEXT    NOT NULL,
      name             TEXT    NOT NULL,
      difficulty       TEXT    NOT NULL,
      tags             TEXT    NOT NULL,
      status           TEXT    NOT NULL,
      total_distance_m REAL,
      content_hash     TEXT    NOT NULL,
      synced_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_waypoints (
      id                    TEXT    PRIMARY KEY,
      route_id              TEXT    NOT NULL
                                      REFERENCES local_routes(id) ON DELETE CASCADE,
      position              REAL    NOT NULL,
      lat                   REAL    NOT NULL,
      lng                   REAL    NOT NULL,
      heading               REAL,
      annotation_text       TEXT,
      annotation_audio_path TEXT,
      photo_path            TEXT,
      hazard_type           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_local_waypoints_route
      ON local_waypoints(route_id);
    CREATE INDEX IF NOT EXISTS idx_local_waypoints_pos
      ON local_waypoints(route_id, position);

    CREATE TABLE IF NOT EXISTS sync_state (
      campus_id   TEXT    PRIMARY KEY,
      synced_at   INTEGER,
      routes_hash TEXT
    );
  `);
}

// ── Core upsert — shared by sync engine and pre-load ──────────────────────

/**
 * Atomically writes a route and its waypoints to local SQLite.
 *
 * This is the single `upsertRoute` implementation shared by:
 *   - syncEngine.ts (full campus sync)
 *   - routeMatchingService.ts (single-route pre-load on selection)
 *
 * Audio and photo paths start as null. Call `cacheRouteMedia` after this
 * function to download media and populate the paths.
 */
export async function upsertRoute(
  route: UpsertRouteInput,
  waypoints: UpsertWaypointInput[]
): Promise<void> {
  const db = await getDb();
  const tagsJson = JSON.stringify(route.tags);

  // withExclusiveTransactionAsync prevents concurrent sync and pre-load
  // operations from interleaving their writes.
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_routes
         (id, campus_id, name, difficulty, tags, status, total_distance_m, content_hash, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name             = excluded.name,
         difficulty       = excluded.difficulty,
         tags             = excluded.tags,
         status           = excluded.status,
         total_distance_m = excluded.total_distance_m,
         content_hash     = excluded.content_hash,
         synced_at        = excluded.synced_at`,
      [
        route.id,
        route.campusId,
        route.name,
        route.difficulty,
        tagsJson,
        route.status,
        route.totalDistanceM,
        route.contentHash,
        Date.now(),
      ]
    );

    // Replace waypoints wholesale — positions may shift on re-record.
    await txn.runAsync('DELETE FROM local_waypoints WHERE route_id = ?', [route.id]);

    for (const wp of waypoints) {
      await txn.runAsync(
        `INSERT INTO local_waypoints
           (id, route_id, position, lat, lng, heading,
            annotation_text, annotation_audio_path, photo_path, hazard_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        [
          wp.id,
          route.id,
          wp.position,
          wp.lat,
          wp.lng,
          wp.heading,
          wp.annotationText,
          wp.hazardType,
        ]
      );
    }
  });
}

// ── Sync helpers ───────────────────────────────────────────────────────────

/** Returns a map of route_id → content_hash for all local routes in a campus. */
export async function getAllRouteHashes(
  campusId: string
): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; content_hash: string }>(
    'SELECT id, content_hash FROM local_routes WHERE campus_id = ?',
    [campusId]
  );
  return Object.fromEntries(
    rows.map((r: { id: string; content_hash: string }) => [r.id, r.content_hash])
  );
}

/**
 * Flags a route as retracted locally.
 *
 * Data is preserved for diagnostic review until the next full sync cycle.
 * Navigation checks `isRouteRetracted` before starting and blocks the session.
 */
export async function markRouteRetracted(routeId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE local_routes SET status = 'retracted', synced_at = ? WHERE id = ?`,
    [Date.now(), routeId]
  );
}

export async function isRouteRetracted(routeId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ status: string }>(
    'SELECT status FROM local_routes WHERE id = ?',
    [routeId]
  );
  return row?.status === 'retracted';
}

export async function updateSyncState(campusId: string, syncedAt: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_state (campus_id, synced_at)
     VALUES (?, ?)
     ON CONFLICT(campus_id) DO UPDATE SET synced_at = excluded.synced_at`,
    [campusId, syncedAt]
  );
}

/** Returns the last sync timestamp for a campus, or null if never synced. */
export async function getLastSyncedAt(campusId: string): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ synced_at: number | null }>(
    'SELECT synced_at FROM sync_state WHERE campus_id = ?',
    [campusId]
  );
  return row?.synced_at ?? null;
}

// ── Navigation helpers ─────────────────────────────────────────────────────

/** Returns waypoints for a route in ascending position order. */
export async function getOrderedWaypoints(routeId: string): Promise<LocalWaypoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    route_id: string;
    position: number;
    lat: number;
    lng: number;
    heading: number | null;
    annotation_text: string | null;
    annotation_audio_path: string | null;
    photo_path: string | null;
    hazard_type: string | null;
  }>(
    `SELECT id, route_id, position, lat, lng, heading,
            annotation_text, annotation_audio_path, photo_path, hazard_type
     FROM local_waypoints
     WHERE route_id = ?
     ORDER BY position`,
    [routeId]
  );
  return rows.map((r: {
    id: string;
    route_id: string;
    position: number;
    lat: number;
    lng: number;
    heading: number | null;
    annotation_text: string | null;
    annotation_audio_path: string | null;
    photo_path: string | null;
    hazard_type: string | null;
  }) => ({
    id: r.id,
    routeId: r.route_id,
    position: r.position,
    lat: r.lat,
    lng: r.lng,
    heading: r.heading,
    annotationText: r.annotation_text,
    annotationAudioPath: r.annotation_audio_path,
    photoPath: r.photo_path,
    hazardType: r.hazard_type,
  }));
}

/** Writes the local filesystem path for a waypoint's downloaded audio clip. */
export async function setWaypointAudioPath(
  waypointId: string,
  path: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE local_waypoints SET annotation_audio_path = ? WHERE id = ?',
    [path, waypointId]
  );
}

export async function getLocalRoute(routeId: string): Promise<LocalRoute | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    campus_id: string;
    name: string;
    difficulty: string;
    tags: string;
    status: string;
    total_distance_m: number | null;
    content_hash: string;
    synced_at: number;
  }>('SELECT * FROM local_routes WHERE id = ?', [routeId]);

  if (!row) return null;
  return {
    id: row.id,
    campusId: row.campus_id,
    name: row.name,
    difficulty: row.difficulty as LocalRoute['difficulty'],
    tags: JSON.parse(row.tags) as string[],
    status: row.status as LocalRoute['status'],
    totalDistanceM: row.total_distance_m,
    contentHash: row.content_hash,
    syncedAt: row.synced_at,
  };
}
