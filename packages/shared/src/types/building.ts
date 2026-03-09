import type { Coordinate } from './geo';

export type BuildingCategory =
  | 'academic'
  | 'residential'
  | 'dining'
  | 'administrative'
  | 'athletic'
  | 'medical'
  | 'utility'
  | 'outdoor'
  | 'other';

/**
 * A building or named outdoor space on a campus.
 */
export interface Building {
  id: string;
  campusId: string;
  name: string;
  shortName: string | null;
  category: BuildingCategory;
  /** Polygon ring of the building footprint, as [lng, lat] pairs */
  footprint: [number, number][];
  /** Central access point used as navigation target */
  mainEntrance: Coordinate;
  /** All named entry points */
  entrances: Entrance[];
  floor?: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entrance {
  id: string;
  buildingId: string;
  name: string;
  coordinate: Coordinate;
  isMain: boolean;
  accessibilityNotes: string | null;
}

export interface CreateBuildingInput {
  campusId: string;
  name: string;
  shortName?: string;
  category: BuildingCategory;
  footprint: [number, number][];
  mainEntrance: Coordinate;
  description?: string;
}
