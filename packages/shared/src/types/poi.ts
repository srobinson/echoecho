import type { Coordinate } from './geo';

export type POICategory =
  | 'restroom'
  | 'water_fountain'
  | 'elevator'
  | 'ramp'
  | 'bus_stop'
  | 'parking'
  | 'emergency_phone'
  | 'seating'
  | 'vending'
  | 'atm'
  | 'other';

/**
 * Point of Interest — accessibility-relevant fixed features on campus.
 */
export interface POI {
  id: string;
  campusId: string;
  buildingId: string | null;
  category: POICategory;
  name: string;
  coordinate: Coordinate;
  floor: number | null;
  description: string | null;
  isAccessible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePOIInput {
  campusId: string;
  buildingId?: string;
  category: POICategory;
  name: string;
  coordinate: Coordinate;
  floor?: number;
  description?: string;
  isAccessible: boolean;
}
