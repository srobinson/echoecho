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
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { syncCampus } from '../lib/syncEngine';
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
  /** True when both cache and network failed to provide campus data. Safety-critical for emergency routing. */
  loadFailed: boolean;
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
  loadFailed: false,
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
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchFromNetwork = useCallback(async (): Promise<boolean> => {
    try {
      const { data: campusRow, error: campusErr } = await supabase
        .from('campuses')
        .select('id, name, security_phone')
        .limit(1)
        .maybeSingle();

      if (campusErr) {
        console.error('[CampusContext] Failed to fetch campus:', campusErr.message);
        return false;
      }
      if (!campusRow) {
        console.warn('[CampusContext] No campus configured');
        return false;
      }

      const campusInfo: CampusInfo = {
        id: campusRow.id as string,
        name: campusRow.name as string,
        securityPhone: (campusRow.security_phone as string | null) ?? null,
      };

      // Fetch all buildings with entrances for this campus
      const { data: buildings, error: buildErr } = await supabase
        .from('buildings')
        .select('id, name, entrances:building_entrances(id, building_id, name, coordinate, is_main, accessibility_notes)')
        .eq('campus_id', campusInfo.id);

      if (buildErr || !buildings) return false;

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

      setLoadFailed(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const restoreFromCache = useCallback(async () => {
    let cacheHit = false;
    try {
      const [campusJson, entrancesJson, secJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_CAMPUS),
        AsyncStorage.getItem(STORAGE_KEY_ENTRANCES),
        AsyncStorage.getItem(STORAGE_KEY_SECURITY_WPS),
      ]);

      if (campusJson) {
        setCampus(JSON.parse(campusJson) as CampusInfo);
        cacheHit = true;
      }
      if (entrancesJson) setEntrances(JSON.parse(entrancesJson) as Entrance[]);
      if (secJson) setSecurityWaypoints(JSON.parse(secJson) as Waypoint[]);
    } catch {
      // Cache read failure is non-fatal
    }

    // If cache had data, mark loaded immediately so the app is usable.
    // Network fetch will still update in the background.
    if (cacheHit) {
      setIsLoaded(true);
      void fetchFromNetwork();
      return;
    }

    // No cache: network is the only source. Wait for it before marking loaded
    // so consumers do not render with null campus.
    const networkSuccess = await fetchFromNetwork();
    if (!networkSuccess) {
      setLoadFailed(true);
    }
    setIsLoaded(true);
  }, [fetchFromNetwork]);

  useEffect(() => {
    void restoreFromCache();
  }, [restoreFromCache]);

  // Sync route data when the app returns to the foreground (ALP-1087).
  // syncCampus has its own 15-minute throttle, so rapid foreground/background
  // cycles do not cause redundant network requests.
  const prevAppState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (prevAppState.current !== 'active' && nextState === 'active' && campus?.id) {
        void syncCampus(campus.id);
      }
      prevAppState.current = nextState;
    });
    return () => sub.remove();
  }, [campus?.id]);

  const refresh = useCallback(async () => {
    const success = await fetchFromNetwork();
    if (success) {
      setLoadFailed(false);
    }
  }, [fetchFromNetwork]);

  return (
    <CampusContext.Provider value={{ campus, entrances, securityWaypoints, isLoaded, loadFailed, refresh }}>
      {children}
    </CampusContext.Provider>
  );
}
