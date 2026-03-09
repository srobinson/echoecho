/**
 * Local building name index for voice destination fuzzy matching (ALP-954).
 *
 * The bundle is generated at build time from the Supabase `buildings` table and
 * shipped with the binary. It is updated from AsyncStorage on every sync cycle
 * (ALP-963). fuzzySearch uses fuse.js with threshold 0.4, name at 2× weight.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';

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

// Bundled fallback — populated by the build pipeline from buildings table.
// This ensures STT matching works on first launch before any sync.
const BUNDLED_BUILDINGS: BuildingEntry[] = [];

let _index: Fuse<BuildingEntry> | null = null;
let _entries: BuildingEntry[] = BUNDLED_BUILDINGS;

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

/** Load the persisted building index from AsyncStorage. Falls back to bundled data. */
export async function loadBuildingIndex(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as BuildingEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        _entries = parsed;
      }
    }
  } catch {
    // Use bundled fallback silently.
  }
  _index = buildFuseIndex(_entries);
}

/** Persist a new set of buildings from a sync cycle. */
export async function updateBuildingIndex(buildings: BuildingEntry[]): Promise<void> {
  _entries = buildings;
  _index = buildFuseIndex(buildings);
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
