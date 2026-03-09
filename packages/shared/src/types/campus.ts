import type { Coordinate, BoundingBox } from './geo';

/**
 * A campus is the top-level administrative unit (e.g. TSBVI Austin).
 */
export interface Campus {
  id: string;
  name: string;
  shortName: string;
  center: Coordinate;
  bounds: BoundingBox;
  defaultZoom: number;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface CreateCampusInput {
  name: string;
  shortName: string;
  center: Coordinate;
  bounds: BoundingBox;
  defaultZoom?: number;
}
