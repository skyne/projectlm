/** WebSocket protocol mirror — keep in sync with server/src/ws_protocol.ts */

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
  carNumber: string;
  classId: string;
  lap: number;
  distance: number;
  normalizedT: number;
  speed: number;
  rpm: number;
  fuel: number;
  tireWear: number;
  tireWearFL?: number;
  tireWearFR?: number;
  tireWearRL?: number;
  tireWearRR?: number;
  tireTempC?: number;
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;
  coolantTempC?: number;
  hybridDeployMJ?: number;
  engineHealth: number;
  sectorIndex: number;
  racePosition: number;
  classPosition?: number;
  inPit: boolean;
  pitQueued?: boolean;
  retired: boolean;
  retireReason?: string;
  currentLapTime: number;
  currentSectorTime: number;
  lastLapTime: number;
  bestLapTime: number;
  gapToLeader: number;
  currentLapSectorTimes: number[];
  lapHistory: LapTimingSnapshot[];
  position: Vec3;
  tangent: Vec3;
  lateralOffset?: number;
  carLengthM?: number;
  carWidthM?: number;
  driverName?: string;
  driverMode?: string;
  driverStamina?: number;
  driverPressure?: number;
  driverMistakeRisk?: number;
  activeDriverIndex?: number;
  driverRoster?: DriverSnapshotPayload[];
  lastMistakeKind?: string;
  lastMistakeRemainingSec?: number;
  lastMistakeWearPct?: number;
  lastMistakeWheel?: string;
  wearBoostRemainingSec?: number;
  wearBoostMultiplier?: number;
  overtaking?: boolean;
  blocked?: boolean;
  pitRemainingSec?: number;
  setupFeedback?: string;
  wingAngle?: number;
  brakeBias?: number;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  pitCount?: number;
  fuelTankCapacity?: number;
  driverStintSeconds?: number;
  maxDriverStintSeconds?: number;
}

export type SimEventType =
  | "SectorCross"
  | "LapComplete"
  | "PitEnter"
  | "PitExit"
  | "Retirement"
  | "RaceComplete"
  | "Overtake"
  | "Collision"
  | "Blocked"
  | "CommandAck";

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

export interface WeatherContextPayload {
  trackId: string;
  month: number;
  monthName: string;
  biome: string;
  label: string;
  rainWeight: number;
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
    carNumber: string;
    classId: string;
  }>;
  carNumberByEntryId: Record<string, string>;
  playerEntryId?: string;
  managedEntryIds?: string[];
  paused?: boolean;
  weatherContext?: WeatherContextPayload;
  /** True when a race weekend session is in progress (live or paused). */
  raceActive: boolean;
  /** True when the race has finished but the weekend session may still be open. */
  raceComplete?: boolean;
  /** Elapsed race time in seconds when reconnecting mid-race. */
  raceTime?: number;
  /** Server-side time compression when reconnecting mid-race. */
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

export interface DriverSnapshotPayload {
  name: string;
  tier: string;
  nationality: string;
  dryPace: number;
  wetPace: number;
  consistency: number;
  overtaking: number;
  defending: number;
  setupFeedback: number;
  stamina: number;
  composure: number;
  active: boolean;
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

export interface DriverStatDefPayload {
  key: string;
  label: string;
  short: string;
  description: string;
  min: number;
  max: number;
  costPerPoint: number;
}

export type DriverMarketSource = "wec_active" | "wec_retired" | "prospect";

export interface DriverMarketListingPayload {
  id: string;
  source: DriverMarketSource;
  driver: DriverProfilePayload;
  contractedTeam?: string;
  signingFee: number;
  salaryPerRace: number;
  tagline: string;
}

export interface StaffMemberPayload {
  role: string;
  name: string;
  skill: number;
}

export type CalendarEventType = "test" | "race";

export interface CalendarEventPayload {
  round: number;
  trackId: string;
  format: string;
  eventType?: CalendarEventType;
  eventName?: string;
  month?: number;
  completed: boolean;
  championshipPoints: number;
  prizeMoney?: number;
  rdPointsEarned?: number;
}

export interface SponsorContractPayload {
  offerId: string;
  name: string;
  signedRound: number;
}

export interface SponsorOfferPayload {
  id: string;
  name: string;
  tagline: string;
  signingFee: number;
  perRaceIncome: number;
  podiumBonus: number;
  winBonus: number;
  topFiveBonus: number;
  rdPointsPerRace: number;
}

export interface FinanceLineItemPayload {
  label: string;
  amount: number;
}

export interface RaceFinancesPayload {
  prizeMoney: number;
  appearanceFee: number;
  sponsorIncome: number;
  entryFee: number;
  staffPayroll: number;
  netEarnings: number;
  championshipPoints: number;
  rdPointsEarned: number;
  breakdown: FinanceLineItemPayload[];
}

export type CarAffiliation = "manufacturer" | "privateer";
export type CarAcquisition = "build" | "privateer";

export interface EngineBuildPayload {
  engine_layout: string;
  fuel_type: string;
  cylinders: number;
  bore: number;
  stroke: number;
  max_rpm: number;
  peak_torque_nm: number;
  peak_torque_rpm: number;
  base_vibration: number;
  aspiration?: string;
  drivetrain?: string;
  power_target?: number;
  rev_character?: number;
  block_size?: number;
  generator_size?: number;
  generator_kw?: number;
}

export interface CoolingBuildPayload {
  engine_radiator?: number;
  oil_cooler?: number;
  charge_air_cooler?: number;
  gearbox_cooler?: number;
}

export interface CarBuildPayload {
  carName: string;
  chassis_type: string;
  front_aero_type: string;
  rear_aero_type: string;
  cooling_pack: string;
  cooling?: CoolingBuildPayload;
  /** 0–1 duct restriction — set at track in race setup (tape on inlets). */
  duct_airflow?: number;
  wheel_package: string;
  suspension_layout: string;
  front_suspension_layout?: string;
  rear_suspension_layout?: string;
  front_wheel_diameter_in?: number;
  rear_wheel_diameter_in?: number;
  front_tire_width_mm?: number;
  rear_tire_width_mm?: number;
  fuel_system: string;
  brake_system: string;
  transmission: string;
  hybrid_system: string;
  engine?: EngineBuildPayload;
}

export interface FleetCarPayload {
  id: string;
  carNumber: string;
  classId: string;
  affiliation: CarAffiliation;
  acquisition: CarAcquisition;
  manufacturerId?: string;
  platformId?: string;
  build: CarBuildPayload;
  carConfigPath: string;
  /** Indices into meta.driverRoster assigned to this car for race stints. */
  assignedDriverIndices?: number[];
}

export interface CarPlatformPayload {
  id: string;
  displayName: string;
  manufacturerId: string;
  manufacturerName: string;
  classId: string;
  templatePath: string;
  privateerCost: number;
  description: string;
}

export interface FleetRulesPayload {
  startingBudget: number;
  manufacturerHypercarMinCars: number;
  oneCarTypePerClass: boolean;
  maxCarsPerPurchase: number;
  costs: {
    manufacturerBuild: Record<string, number>;
    privateerSlot: Record<string, number>;
  };
}

export type TeamCreationWizardStep =
  | "identity"
  | "livery"
  | "firstCar"
  | "staff"
  | "drivers"
  | "confirm";

export interface TeamCreationDraftPayload {
  step: TeamCreationWizardStep;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  classId: string;
  affiliation: CarAffiliation;
  platformId: string;
  carQuantity: number;
  staff: StaffMemberPayload[];
  driverRoster: DriverProfilePayload[];
}

export interface MetaStatePayload {
  teamName: string;
  budget: number;
  rdPoints: number;
  playerEntryId: string;
  seasonYear: number;
  currentRound: number;
  staff: StaffMemberPayload[];
  sponsors?: SponsorContractPayload[];
  unlockedParts: string[];
  calendar: CalendarEventPayload[];
  setupComplete?: boolean;
  teamCreationDraft?: TeamCreationDraftPayload | null;
  playerClassId?: string;
  teamColors?: { primary: string; secondary: string };
  carBuild?: CarBuildPayload | null;
  fleet?: FleetCarPayload[];
  activeCarId?: string;
  playerCarId?: string;
  driverRoster?: DriverProfilePayload[];
  /** True after founding/buying a manufacturer build until first saveCarBuild */
  carBuildGuidePending?: boolean;
  /** Soft / Medium / Hard — changed during race weekend, not in car design */
  weekendTireCompound?: string;
  driverMarket?: DriverMarketListingPayload[];
  driverMarketRefreshCount?: number;
  driverMarketRound?: number;
}

export interface ClassInfoPayload {
  id: string;
  displayName: string;
  description: string;
  powerCapHp: number;
  minWeightKg: number;
  maxWeightKg: number;
  maxStintHours: number;
}

export interface PartOptionPayload {
  slot: string;
  partType: string;
  fullId: string;
  displayName: string;
  mass: number;
  stats: Record<string, number>;
}

export interface StaffCandidatePayload {
  role: string;
  name: string;
  skill: number;
  salary: number;
}

export interface GameCatalogPayload {
  classes: ClassInfoPayload[];
  partsBySlot: Record<string, PartOptionPayload[]>;
  staffCandidates: StaffCandidatePayload[];
  sponsorOffers?: SponsorOfferPayload[];
  carPlatforms: CarPlatformPayload[];
  fleetRules: FleetRulesPayload;
  driverStatDefs?: DriverStatDefPayload[];
  driverPointPool?: number;
  lemansDriverCount?: number;
  driverMarketPreview?: DriverMarketListingPayload[];
  defaultEngines?: Record<string, EngineBuildPayload>;
  assemblyRules?: AssemblyRulePayload[];
}

export interface AssemblyRequiresAnyRulePayload {
  kind: "requires_any";
  ifSlot: string;
  ifPart: string;
  requiresSlot: string;
  requiresAnyParts: string[];
}

export interface AssemblyRequiresRulePayload {
  kind: "requires";
  ifSlot: string;
  ifPart: string;
  requiresSlot: string;
  requiresPart: string;
}

export type AssemblyRulePayload =
  | AssemblyRequiresAnyRulePayload
  | AssemblyRequiresRulePayload;

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

export interface SaveTeamColorsPayload {
  primary: string;
  secondary: string;
}

export interface WeatherForecastStepPayload {
  offsetMinutes: number;
  phase: string;
  trackWetness: number;
  rainIntensity: number;
  ambientTempC: number;
}

export interface RaceControlPayload {
  fcyActive: boolean;
  scActive: boolean;
  trackWetness: number;
  ambientTempC: number;
  trackGripEvolution: number;
  rainIntensity: number;
  weatherPhase: string;
  forecastRainInSeconds: number;
  forecast: WeatherForecastStepPayload[];
  weatherLabel?: string;
  weatherBiome?: string;
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
  championshipPoints?: number;
  finances?: RaceFinancesPayload;
  results: Array<{
    entryId: string;
    teamName: string;
    carNumber: string;
    classId: string;
    position: number;
  }>;
}

export interface TrackPreviewPayload {
  trackId: string;
  geometry: TrackGeometryPayload;
}

export interface AskEngineerPayload {
  entryId: string;
  question?: string;
}

export interface EngineerAdvicePayload {
  entryId: string;
  text: string;
  suggestedCommand?: string;
  offline: boolean;
  model?: string;
  latencyMs?: number;
}

export interface EngineerStatusPayload {
  online: boolean;
  model: string;
}

export interface AskGarageEngineerPayload {
  classId: string;
  build: CarBuildPayload;
  compiled?: Record<string, number>;
  trackHint?: string;
  question?: string;
}

export interface GarageAdvicePayload {
  text: string;
  suggestedChanges?: Partial<CarBuildPayload>;
  offline: boolean;
  model?: string;
  latencyMs?: number;
}

export type ServerMessageType =
  | "session_init"
  | "track_geometry"
  | "track_preview"
  | "tick"
  | "events"
  | "race_complete"
  | "meta_state"
  | "game_catalog"
  | "engineer_advice"
  | "engineer_status"
  | "garage_advice"
  | "client_assignment"
  | "roster_update"
  | "error";

export type ClientMessageType =
  | "join_session"
  | "set_time_scale"
  | "pause"
  | "resume"
  | "restart_race"
  | "start_round"
  | "reload_definitions"
  | "submit_command"
  | "hire_staff"
  | "rd_invest"
  | "complete_round"
  | "create_team"
  | "save_team_creation_draft"
  | "save_car_build"
  | "buy_car"
  | "set_active_car"
  | "set_player_entry"
  | "remove_car"
  | "save_driver_roster"
  | "refresh_driver_market"
  | "sign_driver_contract"
  | "save_team_colors"
  | "sign_sponsor"
  | "drop_sponsor"
  | "new_game"
  | "get_track_preview"
  | "set_weekend_tire_compound"
  | "ask_engineer"
  | "get_engineer_status"
  | "ask_garage_engineer";

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
