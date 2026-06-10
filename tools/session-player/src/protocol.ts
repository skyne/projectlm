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
  lastLapTime?: number;
  gapToLeader: number;
  classPosition?: number;
  inGarage?: boolean;
  pitQueued?: boolean;
  driverMode?: string;
  fuelTankCapacity?: number;
  position: Vec3;
  tangent: Vec3;
  lateralOffset?: number;
  lateralOffsetM?: number;
  headingError?: number;
  poseIncludesLateral?: boolean;
}

export interface WeatherForecastStepPayload {
  offsetMinutes: number;
  phase: string;
  trackWetness: number;
  rainIntensity: number;
  ambientTempC: number;
  trackTempC?: number;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  visibilityKm?: number;
}

export interface SurfaceHazardSummaryPayload {
  sectorIndex: number;
  kind: string;
  gripMultiplier: number;
  centerDistance?: number;
  centerLateralM?: number;
  spanMeters?: number;
  lateralSpanM?: number;
}

export interface RaceControlPayload {
  fcyActive: boolean;
  scActive: boolean;
  flagPhase?: string;
  sectorFlags?: number[];
  activeIncidentEntryId?: string;
  scLapsRemaining?: number;
  obstructionsOnTrack?: number;
  whiteFlagActive?: boolean;
  surfaceHazards?: SurfaceHazardSummaryPayload[];
  trackWetness: number;
  ambientTempC: number;
  trackTempC?: number;
  trackGripEvolution: number;
  rainIntensity?: number;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  visibilityKm?: number;
  weatherPhase?: string;
  forecastRainInSeconds?: number;
  forecast?: WeatherForecastStepPayload[];
}

export interface SimEvent {
  type: string;
  entryId?: string;
  lap?: number;
  sectorIndex?: number;
  timestamp: number;
  message: string;
}

export type WeekendSessionType = "practice" | "qualifying" | "race";
export type SessionKind = "weekend" | "private_test";

export interface WeekendProgressPayload {
  round: number;
  completedSessions: WeekendSessionType[];
  qualiResults?: Array<{
    entryId: string;
    classId: string;
    bestLapTime: number;
  }>;
}

export interface SessionInitPayload {
  trackName: string;
  targetLaps: number;
  targetDurationSeconds?: number;
  raceFormat?: string;
  roundNumber?: number;
  weekendSessionType?: WeekendSessionType;
  sessionKind?: SessionKind;
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
  assignedDriverIds?: string[];
}

export interface ActiveAgreementPayload {
  id: string;
  kind: string;
  partnerTeam?: string;
  partnerTeams?: string[];
  signedRound: number;
  expiresAtRound: number;
  terms: {
    sharedTrackId?: string;
    testDays?: number;
    testHoursPerDay?: number;
    partnerTeams?: string[];
  };
}

export interface PrivateTestProgressPayload {
  trackId: string;
  carIds: string[];
  driverAssignments: Record<string, string[]>;
  jointAgreementId: string;
  jointPartnerTeams: string[];
  testDays: number;
  testHoursPerDay: number;
  sessionMode: "continuous" | "per_day";
  completedSessionIndices: number[];
}

export interface StartPrivateTestPayload {
  trackId: string;
  carIds: string[];
  driverAssignments: Record<string, string[]>;
  durationHours: number;
  jointAgreementId?: string;
  jointPartnerTeams?: string[];
}

export interface AiRivalTeamPayload {
  teamName: string;
  primaryClassId: string;
  championshipPoints: number;
  lastRoundPoints: number;
  form: number;
  isPlayerTeam?: boolean;
}

export interface DriverChampionshipPayload {
  driverKey: string;
  name: string;
  nationality: string;
  teamName: string;
  classId: string;
  championshipPoints: number;
  lastRoundPoints: number;
  isPlayerDriver?: boolean;
}

export interface AiRivalSeasonPayload {
  seasonYear: number;
  teams: AiRivalTeamPayload[];
  drivers: DriverChampionshipPayload[];
  lastMarketNote?: string;
  lastOffWeekHeadline?: string;
  lastOffWeekEvents?: Array<{
    type: string;
    teamName: string;
    classId?: string;
    text: string;
  }>;
}

export interface MetaStatePayload {
  teamName: string;
  budget: number;
  rdPoints: number;
  playerEntryId: string;
  seasonYear: number;
  currentRound: number;
  setupComplete?: boolean;
  weekendProgress?: WeekendProgressPayload;
  privateTestProgress?: PrivateTestProgressPayload;
  activeAgreements?: ActiveAgreementPayload[];
  fleet?: FleetCarPayload[];
  driverRoster?: DriverProfilePayload[];
  aiRivalSeason?: AiRivalSeasonPayload;
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
  catchUp?: boolean;
}

export interface RaceCompletePayload {
  raceTime: number;
  results: Array<{
    entryId: string;
    teamName: string;
    carNumber: string | number;
    classId: string;
    position: number;
    bestLapTime?: number;
    lastLapTime?: number;
  }>;
  weekendSessionType?: WeekendSessionType;
  sessionKind?: SessionKind;
  nextWeekendSession?: WeekendSessionType | null;
  nextJointTestSessionIndex?: number | null;
  jointTestSessionCount?: number;
  championshipPoints?: number;
}

export interface StaffMemberPayload {
  role: string;
  name: string;
  skill: number;
}

export interface DriverProfilePayload {
  id?: string;
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

export type EngineerHintCategory =
  | "emergency"
  | "fuel"
  | "tyre_wear"
  | "damage"
  | "part_wear"
  | "wrong_tyre";

export interface EngineerHintPayload {
  hintId: string;
  entryId: string;
  carNumber: string;
  category: EngineerHintCategory;
  text: string;
  suggestedCommand?: string;
  autoPaused: boolean;
  timeScale: number;
}

export type ServerMessageType =
  | "session_init"
  | "track_geometry"
  | "tick"
  | "events"
  | "race_complete"
  | "meta_state"
  | "game_catalog"
  | "engineer_hint"
  | "client_assignment"
  | "roster_update"
  | "error";

export type ClientMessageType =
  | "join_session"
  | "set_time_scale"
  | "pause"
  | "resume"
  | "dismiss_engineer_hint"
  | "restart_race"
  | "reload_definitions"
  | "submit_command"
  | "start_round"
  | "start_private_test"
  | "continue_private_test"
  | "continue_weekend_session"
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
