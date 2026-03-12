import { useCallback, useState } from 'react';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

export type CampusBoundaryPhase = 'drawing' | 'closed';

interface DrawState {
  phase: CampusBoundaryPhase;
  vertices: [number, number][];
  isClosed: boolean;
  showCoordinateInput: boolean;
}

const INITIAL_STATE: DrawState = {
  phase: 'drawing',
  vertices: [],
  isClosed: false,
  showCoordinateInput: false,
};

const SNAP_RADIUS_METERS = 5;
const MIN_VERTICES_BEFORE_AUTO_CLOSE = 4;

export function useCampusBoundaryDraw() {
  const [state, setState] = useState<DrawState>(INITIAL_STATE);

  const addVertex = useCallback((coordinate: [number, number]) => {
    setState((prev) => {
      if (prev.phase !== 'drawing') return prev;

      if (prev.vertices.length >= MIN_VERTICES_BEFORE_AUTO_CLOSE) {
        const first = prev.vertices[0];
        const distMeters = distance(point(first), point(coordinate), { units: 'meters' });
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

  const toggleCoordinateInput = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showCoordinateInput: !prev.showCoordinateInput,
    }));
  }, []);

  const setVerticesFromCoordinates = useCallback((vertices: [number, number][]) => {
    setState({
      phase: 'closed',
      vertices,
      isClosed: true,
      showCoordinateInput: false,
    });
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    addVertex,
    undoVertex,
    closePolygon,
    toggleCoordinateInput,
    setVerticesFromCoordinates,
    reset,
  };
}
