import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useCampusStore } from '../stores/campusStore';
import { useAuthStore } from '../stores/authStore';
import { haversineM, type Campus } from '@echoecho/shared';
import { createCampus as createCampusRecord } from '../services/campusService';

// Accuracy.High uses GPS directly and accepts mock locations on emulator.
// Accuracy.Balanced uses Wi-Fi/cell towers which are unavailable on emulator,
// causing getCurrentPositionAsync to hang indefinitely with no timeout.
const LOCATION_ACCURACY = Location.Accuracy.High;

const LOCATION_TIMEOUT_MS = 10_000;

function getCurrentPosition(): Promise<Location.LocationObject> {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: LOCATION_ACCURACY }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timed out')), LOCATION_TIMEOUT_MS)
    ),
  ]);
}

const NEARBY_RADIUS_KM = 5;

type DetectionState =
  | { phase: 'idle' }
  | { phase: 'requesting_permission' }
  | { phase: 'locating' }
  | { phase: 'checking' }
  | { phase: 'found'; campus: Campus }
  | { phase: 'not_found'; latitude: number; longitude: number }
  | { phase: 'no_permission' }
  | { phase: 'error'; message: string };

export function useCampusDetection() {
  const [state, setState] = useState<DetectionState>({ phase: 'idle' });
  const setCampuses = useCampusStore((s) => s.setCampuses);
  const addCampus = useCampusStore((s) => s.addCampus);
  const setActiveCampus = useCampusStore((s) => s.setActiveCampus);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const detect = useCallback(async () => {
    setState({ phase: 'requesting_permission' });

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setState({ phase: 'no_permission' });
      return;
    }

    setState({ phase: 'locating' });
    let coords: Location.LocationObjectCoords;
    try {
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 30_000 });
      const loc = cached ?? await getCurrentPosition();
      coords = loc.coords;
    } catch {
      setState({ phase: 'error', message: 'Could not determine your location.' });
      return;
    }

    setState({ phase: 'checking' });

    const { data, error } = await supabase
      .from('v_campuses' as 'campuses')
      .select('*')
      .order('name');

    if (error) {
      setState({ phase: 'error', message: error.message });
      return;
    }

    const campuses = (data ?? []) as unknown as Campus[];
    setCampuses(campuses);

    const nearest = findNearestCampus(campuses, coords.latitude, coords.longitude);

    if (nearest) {
      setActiveCampus(nearest);
      setState({ phase: 'found', campus: nearest });
    } else {
      setState({
        phase: 'not_found',
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }
  }, [setCampuses, setActiveCampus]);

  const selectCampus = useCallback((campus: Campus) => {
    setActiveCampus(campus);
    setState({ phase: 'found', campus });
  }, [setActiveCampus]);

  const createCampus = useCallback(async (name: string, latitude: number, longitude: number) => {
    // Determine whether this is the first campus (bootstrap path).
    // useCampusStore is populated by detect() before createCampus is ever called.
    const isBootstrap = useCampusStore.getState().campuses.length === 0;
    const campus = await createCampusRecord({
      name,
      latitude,
      longitude,
      isBootstrap,
    });
    addCampus(campus);
    setActiveCampus(campus);
    setState({ phase: 'found', campus });

    // Bootstrap case: the RPC promoted the caller to admin. Refresh the auth
    // profile so the rest of the app reflects the new role immediately.
    if (isBootstrap) {
      await refreshProfile();
    }

    return campus;
  }, [addCampus, setActiveCampus, refreshProfile]);

  return { state, detect, selectCampus, createCampus };
}

function findNearestCampus(
  campuses: Campus[],
  lat: number,
  lng: number,
): Campus | null {
  let nearest: Campus | null = null;
  let minDist = Infinity;

  for (const c of campuses) {
    const dist = haversineM(lat, lng, c.center.latitude, c.center.longitude) / 1000;
    if (dist < NEARBY_RADIUS_KM && dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }

  return nearest;
}
