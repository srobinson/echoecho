import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useCampusStore } from '../stores/campusStore';
import type { Campus } from '@echoecho/shared';

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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
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
    const existing = useCampusStore.getState().campuses;
    setCampuses([...existing, campus]);
    setActiveCampus(campus);
    setState({ phase: 'found', campus });

    return campus;
  }, [setCampuses, setActiveCampus]);

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
    const dist = haversineKm(lat, lng, c.center.latitude, c.center.longitude);
    if (dist < NEARBY_RADIUS_KM && dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }

  return nearest;
}

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
