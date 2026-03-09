// Geo
export type {
  Coordinate,
  CoordinateWithAltitude,
  GeoPoint,
  BoundingBox,
} from './types/geo';

// Campus
export type {
  Campus,
  CreateCampusInput,
} from './types/campus';

// Building
export type {
  BuildingCategory,
  Building,
  Entrance,
  CreateBuildingInput,
} from './types/building';

// Route
export type {
  RouteStatus,
  WaypointType,
  HazardSeverity,
  HazardType,
  Waypoint,
  Hazard,
  Route,
  CreateRouteInput,
  CreateWaypointInput,
  CreateHazardInput,
} from './types/route';

// POI
export type {
  POICategory,
  POI,
  CreatePOIInput,
} from './types/poi';

// User / Auth
export type {
  UserRole,
  User,
  AdminUser,
  StudentUser,
  AuthSession,
} from './types/user';

// Navigation
export type {
  NavigationStatus,
  PositioningMode,
  NavigationSession,
  TurnInstruction,
  HapticPattern,
  OffRouteEvent,
  SavedDestination,
} from './types/navigation';

// Recording
export type {
  RecordingState,
  TrackPoint,
  PendingWaypoint,
  PendingHazard,
  RecordingSession,
} from './types/recording';

// Utilities
export { computeDistance, computeBearing, simplifyTrack } from './utils/geo';
export { bearingToHaptic, hapticPatternLabel } from './utils/haptic';
