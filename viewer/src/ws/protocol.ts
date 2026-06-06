/** WebSocket protocol v1 — mirrors server/src/ws_protocol.ts */

export const PROTOCOL_VERSION = 1;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LapTimingSnapshot {
  lapNumber: number;
  lapTime: number;
  sectorTimes: number[];
}

export interface CarSnapshot {
  entryId: string;
  teamName: string;
  carNumber: number;
  classId: string;
  lap: number;
  distance: number;
  normalizedT: number;
  speed: number;
  rpm: number;
  fuel: number;
  tireWear: number;
  engineHealth: number;
  sectorIndex: number;
  racePosition: number;
  inPit: boolean;
  retired: boolean;
  currentLapTime: number;
  currentSectorTime: number;
  lastLapTime: number;
  bestLapTime: number;
  gapToLeader: number;
  currentLapSectorTimes: number[];
  lapHistory: LapTimingSnapshot[];
  position: Vec3;
  tangent: Vec3;
  fuelTankCapacity?: number;
  pitCount?: number;
  pitQueued?: boolean;
  driverStintSeconds?: number;
  maxDriverStintSeconds?: number;
  coolantTempC?: number;
  blueFlag?: boolean;
  limpMode?: boolean;
  trackLimitsWarnings?: number;
  tireCompound?: string;
  wetTyres?: boolean;
}

export interface RaceControlPayload {
  fcyActive: boolean;
  scActive: boolean;
  trackWetness: number;
  ambientTempC: number;
  trackGripEvolution: number;
  rainIntensity?: number;
  weatherPhase?: string;
  forecastRainInSeconds?: number;
}

export type SimEventType =
  | "SectorCross"
  | "LapComplete"
  | "PitEnter"
  | "PitExit"
  | "Retirement"
  | "RaceComplete";

export interface SimEvent {
  type: SimEventType;
  entryId?: string;
  lap?: number;
  sectorIndex?: number;
  timestamp: number;
  message: string;
}

export interface TrackSectorGeometry {
  name: string;
  startT: number;
  endT: number;
  labelX: number;
  labelZ: number;
}

export interface TrackMapLabel {
  text: string;
  x: number;
  z: number;
  anchor?: "start" | "middle" | "end";
}

export interface TrackGeometryPayload {
  name: string;
  lapLength: number;
  closed: boolean;
  polyline: Array<{ x: number; z: number }>;
  sectors: TrackSectorGeometry[];
  mapLabels?: TrackMapLabel[];
}

export type WeekendSessionType = "practice" | "qualifying" | "race";

export interface CarSessionSetupPayload {
  frontWingAngle: number;
  rearWingAngle: number;
  rideHeightMm: number;
  frontSpringStiffness: number;
  rearSpringStiffness: number;
  frontDamper: number;
  rearDamper: number;
  engineRadiatorOpening: number;
  oilCoolerOpening: number;
  chargeAirCoolerOpening: number;
  gearboxCoolerOpening: number;
}

export interface FleetCarPayload {
  id: string;
  carNumber: string;
  classId: string;
  setup: CarSessionSetupPayload;
}

export interface CalendarEventPayload {
  round: number;
  trackId: string;
  format: string;
  eventType: string;
  eventName: string;
  completed: boolean;
}

export type StaffRole = "engineer" | "mechanic" | "strategist";

export type StaffStatus = "active" | "injured" | "ill" | "poached";

export interface StaffMemberPayload {
  id?: string;
  role: StaffRole;
  name: string;
  skill: number;
  assignedCarId?: string;
  status?: StaffStatus;
  experience?: number;
  salaryPerRace?: number;
  morale?: number;
  unavailableUntilRound?: number;
}

export interface MetaStatePayload {
  teamName: string;
  currentRound: number;
  weekendSession: WeekendSessionType;
  weekendTireCompound: string;
  playerCarId: string;
  activeCarId: string;
  calendar: CalendarEventPayload[];
  fleet: FleetCarPayload[];
  staff?: StaffMemberPayload[];
  budget?: number;
  rdPoints?: number;
  lastRacePayout?: number;
  unlockedParts?: string[];
}

export interface SessionInitPayload {
  trackName: string;
  targetLaps: number;
  targetDurationMinutes?: number;
  sessionType?: WeekendSessionType | "demo";
  eventName?: string;
  simTimestep: number;
  entries: Array<{
    entryId: string;
    teamName: string;
    carNumber: number;
    classId: string;
  }>;
  carNumberByEntryId?: Record<string, number>;
}

export interface TickPayload {
  raceTime: number;
  snapshots: CarSnapshot[];
  raceControl?: RaceControlPayload;
}

export interface EventsPayload {
  events: SimEvent[];
}

export interface RaceCompletePayload {
  raceTime: number;
  results: Array<{
    entryId: string;
    teamName: string;
    carNumber: number;
    classId: string;
    position: number;
  }>;
}

export type ServerMessageType =
  | "session_init"
  | "track_geometry"
  | "tick"
  | "events"
  | "race_complete"
  | "meta_state"
  | "error";

export interface ServerMessage<T = unknown> {
  protocol: typeof PROTOCOL_VERSION;
  type: ServerMessageType;
  payload: T;
}

export type ClientMessageType =
  | "set_time_scale"
  | "pause"
  | "resume"
  | "restart_race"
  | "reload_definitions"
  | "get_meta"
  | "start_session"
  | "save_car_setup"
  | "set_active_car"
  | "advance_weekend"
  | "complete_round";

export interface ClientMessage<T = unknown> {
  protocol: typeof PROTOCOL_VERSION;
  type: ClientMessageType;
  payload: T;
}

export function clientMessage<T>(
  type: ClientMessageType,
  payload: T,
): ClientMessage<T> {
  return { protocol: PROTOCOL_VERSION, type, payload };
}
