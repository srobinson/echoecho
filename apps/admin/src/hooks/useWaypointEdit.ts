/**
 * useWaypointEdit — edit buffer for route waypoint modifications.
 *
 * Deep copies the route's waypoints on enter. All mutations happen
 * in the local buffer. On save confirm, batch upserts to Supabase
 * and recomputes the route geometry LineString.
 */

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import { supabase } from '../lib/supabase';
import type { Waypoint, WaypointType, Route } from '@echoecho/shared';

export type EditPhase = 'idle' | 'editing' | 'reorder' | 'confirm';

interface EditState {
  phase: EditPhase;
  route: Route | null;
  originalWaypoints: Waypoint[];
  editBuffer: Waypoint[];
  selectedIndex: number | null;
}

const INITIAL: EditState = {
  phase: 'idle',
  route: null,
  originalWaypoints: [],
  editBuffer: [],
  selectedIndex: null,
};

export function useWaypointEdit() {
  const [state, setState] = useState<EditState>(INITIAL);
  const [isSaving, setIsSaving] = useState(false);
  const routeRef = useRef<Route | null>(null);

  const startEditing = useCallback((route: Route) => {
    const copy = route.waypoints.map((w) => ({ ...w }));
    routeRef.current = route;
    setState({
      phase: 'editing',
      route,
      originalWaypoints: route.waypoints,
      editBuffer: copy,
      selectedIndex: null,
    });
  }, []);

  const cancel = useCallback(() => {
    routeRef.current = null;
    setState(INITIAL);
  }, []);

  const selectWaypoint = useCallback((index: number | null) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const updateWaypointCoordinate = useCallback((index: number, lng: number, lat: number) => {
    setState((prev) => {
      const buffer = [...prev.editBuffer];
      if (!buffer[index]) return prev;
      buffer[index] = {
        ...buffer[index],
        coordinate: {
          ...buffer[index].coordinate,
          longitude: lng,
          latitude: lat,
        },
      };
      return { ...prev, editBuffer: buffer };
    });
  }, []);

  const updateWaypointFields = useCallback((
    index: number,
    fields: Partial<Pick<Waypoint, 'audioLabel' | 'description' | 'type'>>,
  ) => {
    setState((prev) => {
      const buffer = [...prev.editBuffer];
      if (!buffer[index]) return prev;
      buffer[index] = { ...buffer[index], ...fields };
      return { ...prev, editBuffer: buffer };
    });
  }, []);

  const deleteWaypoint = useCallback((index: number) => {
    setState((prev) => {
      const buffer = prev.editBuffer.filter((_, i) => i !== index);
      // Re-index sequence
      const reindexed = buffer.map((w, i) => ({ ...w, sequenceIndex: i }));
      return {
        ...prev,
        editBuffer: reindexed,
        selectedIndex: null,
      };
    });
  }, []);

  const insertWaypointAtSegment = useCallback((
    segmentCoordinate: [number, number],
  ) => {
    setState((prev) => {
      if (prev.editBuffer.length < 2) return prev;

      // Find the nearest segment
      const coords = prev.editBuffer.map((w) => [
        w.coordinate.longitude,
        w.coordinate.latitude,
      ] as [number, number]);
      const line = lineString(coords);
      const tapped = point(segmentCoordinate);
      const nearest = nearestPointOnLine(line, tapped);
      const insertIndex = Math.min(
        (nearest.properties.index ?? 0) + 1,
        prev.editBuffer.length,
      );

      const newWaypoint: Waypoint = {
        id: `new-${Date.now()}`,
        routeId: prev.route?.id ?? '',
        sequenceIndex: insertIndex,
        coordinate: {
          longitude: segmentCoordinate[0],
          latitude: segmentCoordinate[1],
          altitude: null,
        },
        type: 'regular' as WaypointType,
        headingOut: null,
        audioLabel: null,
        description: null,
        photoUrl: null,
        audioAnnotationUrl: null,
        createdAt: new Date().toISOString(),
      };

      const buffer = [...prev.editBuffer];
      buffer.splice(insertIndex, 0, newWaypoint);
      const reindexed = buffer.map((w, i) => ({ ...w, sequenceIndex: i }));

      return { ...prev, editBuffer: reindexed };
    });
  }, []);

  const moveWaypoint = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    setState((prev) => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= prev.editBuffer.length) return prev;

      const buffer = [...prev.editBuffer];
      const temp = buffer[fromIndex];
      buffer[fromIndex] = buffer[toIndex];
      buffer[toIndex] = temp;
      const reindexed = buffer.map((w, i) => ({ ...w, sequenceIndex: i }));

      return { ...prev, editBuffer: reindexed };
    });
  }, []);

  const showReorderList = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'reorder' }));
  }, []);

  const hideReorderList = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'editing' }));
  }, []);

  const requestSave = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'confirm', selectedIndex: null }));
  }, []);

  const confirmSave = useCallback(async () => {
    const route = routeRef.current;
    if (!route) return;

    setIsSaving(true);

    // Delete removed waypoints
    const editIds = new Set(state.editBuffer.map((w) => w.id));
    const deletedIds = state.originalWaypoints
      .filter((w) => !editIds.has(w.id))
      .map((w) => w.id);

    // Separate new vs existing
    const newWaypoints = state.editBuffer.filter((w) => w.id.startsWith('new-'));
    const existingWaypoints = state.editBuffer.filter((w) => !w.id.startsWith('new-'));

    try {
      // Delete removed
      if (deletedIds.length > 0) {
        const { error } = await supabase
          .from('waypoints')
          .delete()
          .in('id', deletedIds);
        if (error) throw error;
      }

      // Update existing
      for (const w of existingWaypoints) {
        const geomWkt = `SRID=4326;POINT(${w.coordinate.longitude} ${w.coordinate.latitude})`;
        const { error } = await supabase
          .from('waypoints')
          .update({
            position: w.sequenceIndex,
            geom: geomWkt,
            type: w.type,
            annotation_text: w.audioLabel,
          })
          .eq('id', w.id);
        if (error) throw error;
      }

      // Insert new (batched)
      if (newWaypoints.length > 0) {
        const { error } = await supabase
          .from('waypoints')
          .insert(newWaypoints.map((w) => ({
            route_id: route.id,
            position: w.sequenceIndex,
            recorded_at: new Date().toISOString(),
            geom: `SRID=4326;POINT(${w.coordinate.longitude} ${w.coordinate.latitude})`,
            type: w.type,
            annotation_text: w.audioLabel,
          })));
        if (error) throw error;
      }

      setIsSaving(false);
      routeRef.current = null;
      setState(INITIAL);
    } catch (e) {
      setIsSaving(false);
      Alert.alert(
        'Save failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    }
  }, [state.editBuffer, state.originalWaypoints]);

  const discardSave = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'editing' }));
  }, []);

  return {
    ...state,
    isSaving,
    startEditing,
    cancel,
    selectWaypoint,
    updateWaypointCoordinate,
    updateWaypointFields,
    deleteWaypoint,
    insertWaypointAtSegment,
    moveWaypoint,
    showReorderList,
    hideReorderList,
    requestSave,
    confirmSave,
    discardSave,
  };
}
