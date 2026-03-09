/**
 * Local building name index for voice destination fuzzy matching (ALP-954).
 *
 * Load order: AsyncStorage cache > Supabase network fetch > empty (no bundled
 * fallback since the build pipeline codegen is not yet wired). The network
 * fetch on first launch ensures STT matching works immediately after install.
 *
 * Updated from AsyncStorage on every sync cycle (ALP-963).
 * fuzzySearch uses fuse.js with threshold 0.4, name at 2x weight.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import { supabase } from './supabase';

const STORAGE_KEY = 'echoecho:building_index:v1';

export interface BuildingEntry {
  id: string;
  name: string;
  shortName: string;
  campusId: string;
}

export interface FuseMatch {
  item: BuildingEntry;
  score: number;
}

let _index: Fuse<BuildingEntry> | null = null;
let _entries: BuildingEntry[] = [];
let _loaded = false;

function buildFuseIndex(entries: BuildingEntry[]): Fuse<BuildingEntry> {
  return new Fuse(entries, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'shortName', weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

/**
 * Fetch all buildings from Supabase and persist to AsyncStorage.
 * Used as a network fallback when no cached data exists (first launch).
 */
async function fetchBuildingsFromNetwork(): Promise<BuildingEntry[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, short_name, campus_id');

  if (error || !data || data.length === 0) return [];

  const entries: BuildingEntry[] = (data as Array<{
    id: string;
    name: string;
    short_name: string | null;
    campus_id: string;
  }>).map((b) => ({
    id: b.id,
    name: b.name,
    shortName: b.short_name ?? b.name,
    campusId: b.campus_id,
  }));

  // Persist so subsequent launches use the cache
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Non-fatal
  }

  return entries;
}

/**
 * Load the building index. Tries AsyncStorage first, then falls back to a
 * Supabase network fetch. The index is empty only if both sources fail.
 */
export async function loadBuildingIndex(): Promise<void> {
  // Try AsyncStorage cache first
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as BuildingEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        _entries = parsed;
        _index = buildFuseIndex(_entries);
        _loaded = true;
        return;
      }
    }
  } catch {
    // Fall through to network fetch
  }

  // No cached data: fetch from Supabase (first launch path)
  try {
    const networkEntries = await fetchBuildingsFromNetwork();
    if (networkEntries.length > 0) {
      _entries = networkEntries;
    }
  } catch {
    // Both sources failed; index remains empty until next sync
  }

  _index = buildFuseIndex(_entries);
  _loaded = true;
}

/** Persist a new set of buildings from a sync cycle. */
export async function updateBuildingIndex(buildings: BuildingEntry[]): Promise<void> {
  _entries = buildings;
  _index = buildFuseIndex(buildings);
  _loaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buildings));
  } catch {
    // Persist failure is non-fatal; the in-memory index is still valid.
  }
}

/**
 * Fuzzy-search the building index.
 *
 * Returns matches sorted by score (best first). The caller decides whether
 * a single match or multiple close matches requires disambiguation.
 */
export function fuzzySearch(query: string): FuseMatch[] {
  if (!_index) {
    _index = buildFuseIndex(_entries);
  }
  const results = _index.search(query);
  return results.map((r) => ({ item: r.item, score: r.score ?? 1 }));
}

export function getBuildingEntries(): BuildingEntry[] {
  return _entries;
}

export function isBuildingIndexLoaded(): boolean {
  return _loaded;
}
