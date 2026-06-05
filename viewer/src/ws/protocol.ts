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

export interface SessionInitPayload {
  trackName: string;
  targetLaps: number;
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
  | "reload_definitions";

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
