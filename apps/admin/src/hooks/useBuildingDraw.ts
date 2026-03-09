/**
 * useBuildingDraw — state machine for the building creation flow.
 *
 * Phases: idle > drawing > closed > metadata > entrances > idle
 *
 * Handles vertex collection, snap-to-close detection, polygon
 * validation, and Supabase persistence for new buildings.
 */

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import { supabase } from '../lib/supabase';
import { snapToPolygonEdge } from '../components/building/EntranceMarkingTool';
import type { Building, Entrance, CreateBuildingInput, BuildingCategory } from '@echoecho/shared';

export type DrawPhase = 'idle' | 'drawing' | 'closed' | 'metadata' | 'entrances';

interface BuildingMetadata {
  name: string;
  shortName: string;
  description: string;
  category: BuildingCategory;
}

interface DrawState {
  phase: DrawPhase;
  vertices: [number, number][];
  isClosed: boolean;
  savedBuilding: Building | null;
  pendingEntrances: Entrance[];
  showCoordinateInput: boolean;
}

const INITIAL_STATE: DrawState = {
  phase: 'idle',
  vertices: [],
  isClosed: false,
  savedBuilding: null,
  pendingEntrances: [],
  showCoordinateInput: false,
};

// Distance in meters for snap-to-close on the first vertex
const SNAP_RADIUS_METERS = 15;

export function useBuildingDraw(campusId: string | null) {
  const [state, setState] = useState<DrawState>(INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const savedBuildingRef = useRef<Building | null>(null);

  const startDrawing = useCallback(() => {
    setState({ ...INITIAL_STATE, phase: 'drawing' });
  }, []);

  const cancel = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const addVertex = useCallback((coordinate: [number, number]) => {
    setState((prev) => {
      if (prev.phase !== 'drawing') return prev;

      // Check snap-to-close: if tapping near the first vertex and we have >= 3 vertices
      if (prev.vertices.length >= 3) {
        const first = prev.vertices[0];
        const distMeters = distance(
          point(first),
          point(coordinate),
          { units: 'meters' },
        );
        if (distMeters < SNAP_RADIUS_METERS) {
          return { ...prev, isClosed: true, phase: 'closed' };
        }
      }

      return { ...prev, vertices: [...prev.vertices, coordinate] };
    });
  }, []);

  const undoVertex = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== 'drawing' || prev.vertices.length === 0) return prev;
      return { ...prev, vertices: prev.vertices.slice(0, -1) };
    });
  }, []);

  const closePolygon = useCallback(() => {
    setState((prev) => {
      if (prev.vertices.length < 3) return prev;
      return { ...prev, isClosed: true, phase: 'closed' };
    });
  }, []);

  const setVerticesFromCoordinates = useCallback((vertices: [number, number][]) => {
    setState((prev) => ({
      ...prev,
      vertices,
      isClosed: true,
      phase: 'closed',
      showCoordinateInput: false,
    }));
  }, []);

  const toggleCoordinateInput = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showCoordinateInput: !prev.showCoordinateInput,
    }));
  }, []);

  const proceedToMetadata = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'metadata' }));
  }, []);

  const saveBuilding = useCallback(async (metadata: BuildingMetadata) => {
    if (!campusId) {
      Alert.alert('No campus', 'Select a campus before adding buildings.');
      return;
    }

    // Snapshot vertices at call entry to prevent stale closure reads
    // if state mutates during the async Supabase insert
    const vertices = state.vertices;
    if (vertices.length < 3) return;

    setIsSaving(true);

    const centroid = computeCentroid(vertices);
    const footprintRing = [...vertices, vertices[0]];

    const input: CreateBuildingInput = {
      campusId,
      name: metadata.name,
      shortName: metadata.shortName || undefined,
      category: metadata.category,
      footprint: footprintRing,
      mainEntrance: { latitude: centroid[1], longitude: centroid[0] },
      description: metadata.description || undefined,
    };

    const wkt = `SRID=4326;POLYGON((${footprintRing.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
    const { data, error } = await supabase
      .from('buildings')
      .insert({
        campus_id: input.campusId,
        name: input.name,
        short_name: input.shortName ?? null,
        category: input.category,
        outline: wkt,
        description: input.description ?? null,
      })
      .select('*')
      .single();

    setIsSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    const savedBuilding: Building = {
      id: data.id,
      campusId: data.campus_id,
      name: data.name,
      shortName: data.short_name ?? data.name,
      category: data.category ?? 'other',
      footprint: vertices,
      mainEntrance: { latitude: centroid[1], longitude: centroid[0] },
      entrances: [],
      floor: data.floors ?? null,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    savedBuildingRef.current = savedBuilding;
    setState((prev) => ({
      ...prev,
      phase: 'entrances',
      savedBuilding,
    }));
  }, [campusId, state.vertices]);

  const addEntrance = useCallback(async (
    tappedCoordinate: [number, number],
    name: string,
    isMain: boolean,
  ) => {
    const building = savedBuildingRef.current;
    if (!building) return;

    const snapped = snapToPolygonEdge(building.footprint, tappedCoordinate);

    const { data, error } = await supabase
      .from('building_entrances')
      .insert({
        building_id: building.id,
        name,
        coordinate: { longitude: snapped[0], latitude: snapped[1] },
        is_main: isMain,
      })
      .select('*')
      .single();

    if (error) {
      Alert.alert('Save entrance failed', error.message);
      return;
    }

    const entrance: Entrance = {
      id: data.id,
      buildingId: building.id,
      name: data.name,
      coordinate: { longitude: snapped[0], latitude: snapped[1] },
      isMain: data.is_main,
      accessibilityNotes: data.accessibility_notes ?? null,
    };

    setState((prev) => ({
      ...prev,
      pendingEntrances: [...prev.pendingEntrances, entrance],
      savedBuilding: prev.savedBuilding
        ? { ...prev.savedBuilding, entrances: [...prev.savedBuilding.entrances, entrance] }
        : null,
    }));
  }, []);

  const finishEntrances = useCallback(() => {
    const building = savedBuildingRef.current;
    savedBuildingRef.current = null;
    setState(INITIAL_STATE);
    return building;
  }, []);

  return {
    ...state,
    isSaving,
    startDrawing,
    cancel,
    addVertex,
    undoVertex,
    closePolygon,
    setVerticesFromCoordinates,
    toggleCoordinateInput,
    proceedToMetadata,
    saveBuilding,
    addEntrance,
    finishEntrances,
  };
}

function computeCentroid(vertices: [number, number][]): [number, number] {
  const sum = vertices.reduce(
    (acc, v) => [acc[0] + v[0], acc[1] + v[1]],
    [0, 0] as [number, number],
  );
  return [sum[0] / vertices.length, sum[1] / vertices.length];
}
