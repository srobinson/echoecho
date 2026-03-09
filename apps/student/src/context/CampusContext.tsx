/**
 * CampusContext — pre-loaded campus data for offline emergency routing.
 *
 * ALP-962: Security phone number and building entrance data must be available
 * offline after first load. This context loads on app start, persists to
 * AsyncStorage, and is injected into the app root so emergency routing has
 * no async dependency during activation.
 *
 * Data loaded here:
 *   - Active campus record (id, name, security_phone)
 *   - All building entrances (for useEmergencyRouting)
 *   - Security office waypoints (for useEmergencyRouting)
 *
 * The context is intentionally separate from navigationStore. It represents
 * static campus configuration, not ephemeral navigation state.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Entrance, Waypoint } from '@echoecho/shared';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CampusInfo {
  id: string;
  name: string;
  /** Campus security phone number, e.g. '+15124633000'. Null if not configured. */
  securityPhone: string | null;
}

export interface CampusContextValue {
  campus: CampusInfo | null;
  entrances: Entrance[];
  securityWaypoints: Waypoint[];
  isLoaded: boolean;
  /** Manually re-fetch campus data (e.g. on foreground resume) */
  refresh: () => Promise<void>;
}

// ── Storage keys ───────────────────────────────────────────────────────────

const STORAGE_KEY_CAMPUS = '@echoecho/campus';
const STORAGE_KEY_ENTRANCES = '@echoecho/entrances';
const STORAGE_KEY_SECURITY_WPS = '@echoecho/security_waypoints';

// ── Context ────────────────────────────────────────────────────────────────

const CampusContext = createContext<CampusContextValue>({
  campus: null,
  entrances: [],
  securityWaypoints: [],
  isLoaded: false,
  refresh: async () => {},
});

export function useCampus(): CampusContextValue {
  return useContext(CampusContext);
}

// ── Provider ───────────────────────────────────────────────────────────────

interface CampusProviderProps {
  children: ReactNode;
}

export function CampusProvider({ children }: CampusProviderProps) {
  const [campus, setCampus] = useState<CampusInfo | null>(null);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [securityWaypoints, setSecurityWaypoints] = useState<Waypoint[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Restore from AsyncStorage on mount (instant, offline-first) ──────────
  useEffect(() => {
    void restoreFromCache();
  }, []);

  async function restoreFromCache() {
    try {
      const [campusJson, entrancesJson, secJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_CAMPUS),
        AsyncStorage.getItem(STORAGE_KEY_ENTRANCES),
        AsyncStorage.getItem(STORAGE_KEY_SECURITY_WPS),
      ]);

      if (campusJson) setCampus(JSON.parse(campusJson) as CampusInfo);
      if (entrancesJson) setEntrances(JSON.parse(entrancesJson) as Entrance[]);
      if (secJson) setSecurityWaypoints(JSON.parse(secJson) as Waypoint[]);
    } catch {
      // Cache miss is non-fatal — network fetch will populate it
    } finally {
      // Mark loaded after cache restore so emergency routing can run
      // even if network fetch hasn't completed yet
      setIsLoaded(true);
      // Then try to refresh from network in background
      void fetchFromNetwork();
    }
  }

  const fetchFromNetwork = useCallback(async () => {
    try {
      // Fetch active campus — for TSBVI there is exactly one campus
      const { data: campusRows, error: campusErr } = await supabase
        .from('campuses')
        .select('id, name, security_phone')
        .limit(1)
        .single();

      if (campusErr || !campusRows) return;

      const campusInfo: CampusInfo = {
        id: campusRows.id as string,
        name: campusRows.name as string,
        securityPhone: (campusRows.security_phone as string | null) ?? null,
      };

      // Fetch all buildings with entrances for this campus
      const { data: buildings, error: buildErr } = await supabase
        .from('buildings')
        .select('id, name, entrances:building_entrances(id, building_id, name, coordinate, is_main, accessibility_notes)')
        .eq('campus_id', campusInfo.id);

      if (buildErr || !buildings) return;

      const allEntrances: Entrance[] = (buildings as Array<{
        id: string;
        name: string;
        entrances: Array<{
          id: string;
          building_id: string;
          name: string;
          coordinate: { latitude: number; longitude: number };
          is_main: boolean;
          accessibility_notes: string | null;
        }>;
      }>).flatMap((b) =>
        (b.entrances ?? []).map((e) => ({
          id: e.id,
          buildingId: e.building_id,
          name: `${e.name} — ${b.name}`,
          coordinate: e.coordinate,
          isMain: e.is_main,
          accessibilityNotes: e.accessibility_notes,
        }))
      );

      // Fetch security office waypoints (tagged as POI type 'security')
      const { data: secPois, error: secErr } = await supabase
        .from('pois')
        .select('id, name, coordinate, description')
        .eq('campus_id', campusInfo.id)
        .eq('category', 'security');

      const secWaypoints: Waypoint[] = secErr
        ? []
        : (secPois ?? []).map((p: {
            id: string;
            name: string;
            coordinate: { latitude: number; longitude: number; altitude?: number };
            description: string | null;
          }) => ({
            id: p.id,
            routeId: '',
            sequenceIndex: 0,
            coordinate: {
              latitude: p.coordinate.latitude,
              longitude: p.coordinate.longitude,
              altitude: p.coordinate.altitude ?? 0,
            },
            type: 'landmark' as const,
            headingOut: null,
            audioLabel: p.name,
            description: p.description,
            photoUrl: null,
            audioAnnotationUrl: null,
            createdAt: new Date().toISOString(),
          }));

      // Persist to state and cache
      setCampus(campusInfo);
      setEntrances(allEntrances);
      setSecurityWaypoints(secWaypoints);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY_CAMPUS, JSON.stringify(campusInfo)),
        AsyncStorage.setItem(STORAGE_KEY_ENTRANCES, JSON.stringify(allEntrances)),
        AsyncStorage.setItem(STORAGE_KEY_SECURITY_WPS, JSON.stringify(secWaypoints)),
      ]);
    } catch {
      // Network failure is non-fatal — cached data remains available
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchFromNetwork();
  }, [fetchFromNetwork]);

  return (
    <CampusContext.Provider value={{ campus, entrances, securityWaypoints, isLoaded, refresh }}>
      {children}
    </CampusContext.Provider>
  );
}
