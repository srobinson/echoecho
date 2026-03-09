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

// STT session state (ALP-954 owns, ALP-958 consumes)
export type { SttSessionState } from './types/stt';

// Route matching (ALP-955)
export type {
  MatchRouteRequest,
  RouteMatch,
  MatchRouteResponse,
  MatchRouteErrorCode,
  MatchRouteError,
} from './types/matching';

// Analytics
export type {
  RouteUsageStat,
  TimeOfDayStat,
  OffRoutePoint,
  TopDestination,
  CampusCoverage,
  CompletionRateRow,
} from './types/analytics';

// Utilities
export { computeDistance, computeBearing, haversineM, bearingDeg, normalizeAngle, simplifyTrack } from './utils/geo';
export { bearingToHaptic, hapticPatternLabel } from './utils/haptic';

// Haptic timing data (ALP-974, ALP-958)
export type {
  HapticTimingEvent,
  HapticTimingPattern,
  SchemeCueName,
  SchemeDefinition,
  S4ProximityState,
} from './hapticTimings';
export {
  S1_STRAIGHT, S1_LEFT, S1_RIGHT, S1_ARRIVED,
  S2_STRAIGHT, S2_LEFT, S2_RIGHT, S2_APPROACHING, S2_ARRIVED,
  S3_STRAIGHT, S3_LEFT, S3_RIGHT, S3_APPROACHING, S3_ARRIVED,
  S4_FAR, S4_MEDIUM, S4_CLOSE, S4_IMMINENT, S4_ARRIVED,
  S4_INTERVALS,
  HAPTIC_SCHEMES,
} from './hapticTimings';
