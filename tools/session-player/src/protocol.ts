/** WebSocket protocol v1 — aligned with server/src/ws_protocol.ts */

export const PROTOCOL_VERSION = 1;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CarSnapshot {
  entryId: string;
  teamName: string;
  carNumber: string | number;
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
  position: Vec3;
  tangent: Vec3;
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

export interface SimEvent {
  type: string;
  entryId?: string;
  lap?: number;
  sectorIndex?: number;
  timestamp: number;
  message: string;
}

export interface SessionInitPayload {
  trackName: string;
  targetLaps: number;
  targetDurationSeconds?: number;
  raceFormat?: string;
  roundNumber?: number;
  simTimestep: number;
  entries: Array<{
    entryId: string;
    teamName: string;
    carNumber: string | number;
    classId: string;
  }>;
  carNumberByEntryId: Record<string, string | number>;
  playerEntryId?: string;
  managedEntryIds?: string[];
  paused?: boolean;
  raceActive: boolean;
  raceComplete?: boolean;
  raceTime?: number;
  timeScale?: number;
}

export type ClientRole = "host" | "player" | "spectator";
export type SessionMode = "solo" | "coop" | "competitive" | "spectator_only";

export interface JoinSessionPayload {
  displayName: string;
  playerId?: string;
  requestedRole?: ClientRole;
  joinCode?: string;
  reconnectClientId?: string;
}

export interface ClientAssignmentPayload {
  clientId: string;
  displayName: string;
  playerId?: string;
  role: ClientRole;
  entryIds: string[];
  permissions: string[];
  sessionMode: SessionMode;
}

export interface RosterClientPayload {
  clientId: string;
  displayName: string;
  role: ClientRole;
  entryIds: string[];
}

export interface RosterUpdatePayload {
  clients: RosterClientPayload[];
  sessionMode?: SessionMode;
}

export interface FleetCarPayload {
  id: string;
  carNumber: string;
  classId: string;
}

export interface MetaStatePayload {
  teamName: string;
  budget: number;
  rdPoints: number;
  playerEntryId: string;
  seasonYear: number;
  currentRound: number;
  setupComplete?: boolean;
  fleet?: FleetCarPayload[];
  calendar?: Array<{
    round: number;
    trackId: string;
    format: string;
    eventType: string;
    eventName: string;
    completed: boolean;
  }>;
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
    carNumber: string | number;
    classId: string;
    position: number;
  }>;
}

export interface StaffMemberPayload {
  role: string;
  name: string;
  skill: number;
}

export interface DriverProfilePayload {
  name: string;
  nationality: string;
  tier: string;
  dryPace: number;
  wetPace: number;
  consistency: number;
  overtaking: number;
  defending: number;
  trafficManagement: number;
  rollingStart: number;
  standingStart: number;
  setupFeedback: number;
  tireManagement: number;
  fuelSaving: number;
  composure: number;
  nightPace: number;
  rainRadar: number;
  stamina: number;
  maxStintHours: number;
}

export type CarAffiliation = "manufacturer" | "privateer";
export type CarAcquisition = "build" | "privateer";

export interface BuyCarPayload {
  classId: string;
  affiliation: CarAffiliation;
  acquisition: CarAcquisition;
  platformId?: string;
  carNumber?: string;
  quantity?: number;
}

export interface CreateTeamPayload {
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  staff: StaffMemberPayload[];
  firstCar: BuyCarPayload;
  driverRoster: DriverProfilePayload[];
}

export interface CarPlatformPayload {
  id: string;
  displayName: string;
  classId: string;
  privateerCost: number;
}

export interface GameCatalogPayload {
  classes: Array<{ id: string; displayName: string }>;
  staffCandidates: Array<{
    role: string;
    name: string;
    skill: number;
    salary: number;
  }>;
  carPlatforms: CarPlatformPayload[];
  fleetRules: { startingBudget: number };
  driverPointPool: number;
}

export type ServerMessageType =
  | "session_init"
  | "track_geometry"
  | "tick"
  | "events"
  | "race_complete"
  | "meta_state"
  | "game_catalog"
  | "client_assignment"
  | "roster_update"
  | "error";

export type ClientMessageType =
  | "join_session"
  | "set_time_scale"
  | "pause"
  | "resume"
  | "restart_race"
  | "reload_definitions"
  | "submit_command"
  | "start_round"
  | "set_player_entry"
  | "create_team"
  | "new_game";

export interface ServerMessage<T = unknown> {
  protocol: typeof PROTOCOL_VERSION;
  type: ServerMessageType;
  payload: T;
}

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
