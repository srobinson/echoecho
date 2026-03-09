/**
 * Geographic coordinate types used throughout EchoEcho.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface CoordinateWithAltitude extends Coordinate {
  altitude: number | null;
}

export interface GeoPoint extends CoordinateWithAltitude {
  accuracy: number | null;       // meters
  altitudeAccuracy: number | null;
  heading: number | null;        // degrees, 0=North
  speed: number | null;          // m/s
  timestamp: number;             // Unix ms
}

/** Simple bounding box for map viewport queries */
export interface BoundingBox {
  northEast: Coordinate;
  southWest: Coordinate;
}
