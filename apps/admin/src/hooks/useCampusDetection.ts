import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useCampusStore } from '../stores/campusStore';
import { haversineM, type Campus } from '@echoecho/shared';

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
    const BOUNDS_OFFSET = 0.005;
    const { data, error } = await supabase
      .from('campuses')
      .insert({
        name,
        short_name: name,
        location: `SRID=4326;POINT(${longitude} ${latitude})`,
        bounds: `SRID=4326;POLYGON((${longitude - BOUNDS_OFFSET} ${latitude - BOUNDS_OFFSET}, ${longitude + BOUNDS_OFFSET} ${latitude - BOUNDS_OFFSET}, ${longitude + BOUNDS_OFFSET} ${latitude + BOUNDS_OFFSET}, ${longitude - BOUNDS_OFFSET} ${latitude + BOUNDS_OFFSET}, ${longitude - BOUNDS_OFFSET} ${latitude - BOUNDS_OFFSET}))`,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create campus');
    }

    const { data: created, error: fetchErr } = await supabase
      .from('v_campuses' as 'campuses')
      .select('*')
      .eq('id', data.id)
      .single();

    if (fetchErr || !created) {
      throw new Error(fetchErr?.message ?? 'Failed to fetch created campus');
    }

    const campus = created as unknown as Campus;
    addCampus(campus);
    setActiveCampus(campus);
    setState({ phase: 'found', campus });

    return campus;
  }, [addCampus, setActiveCampus]);

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
