import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useCampusStore } from '../stores/campusStore';
import type { Campus } from '@echoecho/shared';
import { selectNearestCampus } from '../lib/campusDetection';

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

    const nearest = selectNearestCampus(campuses, {
      latitude: coords.latitude,
      longitude: coords.longitude,
    }, NEARBY_RADIUS_KM);

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

  return { state, detect, selectCampus };
}
