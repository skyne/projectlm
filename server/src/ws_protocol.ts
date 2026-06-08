/** WebSocket protocol v1 — see docs/WS_PROTOCOL.md */

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

export type FleetEntryMode = "homologated" | "experimental";

export interface CarSnapshot {
  entryId: string;
  teamName: string;
  carNumber: string;
  classId: string;
  /** Non-championship prototype entry when experimental. */
  entryMode?: FleetEntryMode;
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
  tireCompound?: string;
  tireTempC?: number;
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;
  coolantTempC?: number;
  hybridDeployMJ?: number;
  hybridBudgetMJ?: number;
  hybridStrategy?: string;
  engineHealth: number;
  sectorIndex: number;
  racePosition: number;
  classPosition?: number;
  inGarage?: boolean;
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
  /** Meters along pit lane spline when {@link inPit} is true. */
  pitLaneDistance?: number;
  setupFeedback?: string;
  wingAngle?: number;
  brakeBias?: number;
  frontRideHeightMm?: number;
  rearRideHeightMm?: number;
  frontSpringNm?: number;
  rearSpringNm?: number;
  frontArbStiffness?: number;
  rearArbStiffness?: number;
  frontCamberDeg?: number;
  rearCamberDeg?: number;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  pitCount?: number;
  totalPitSeconds?: number;
  fuelTankCapacity?: number;
  driverStintSeconds?: number;
  maxDriverStintSeconds?: number;
  partHealth?: Record<string, number>;
  /** Parts needing garage-tier rebuild (legacy field name). */
  partIrreparable?: string[];
  partRepairSec?: Record<string, number>;
  physicallyRepairable?: boolean;
  sessionRepairable?: boolean;
  totalRepairSec?: number;
  remainingSessionSec?: number;
  garageRebuildActive?: boolean;
  garageRebuildRemainingSec?: number;
  onFire?: boolean;
  tyreDeflation?: Record<string, "soft" | "flat">;
  limpMode?: string;
  limpReason?: string;
  structuralSeverity?: number;
  suspectedIssues?: boolean;
  hiddenFaults?: HiddenFaultPayload[];
  trackStatus?: string;
  recoveryProgress?: number;
  blueFlag?: boolean;
  blueFlagStrikes?: number;
  pendingPenalty?: string;
  penaltyReason?: string;
  lapsToComply?: number;
  meatballFlag?: boolean;
  blackFlag?: boolean;
  collisionWarnings?: number;
  penaltyStopSeconds?: number;
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
  | "CommandAck"
  | "Stranded"
  | "RecoveryDispatched"
  | "TrackClear"
  | "SurfaceHazard"
  | "SurfaceCleared"
  | "BlueFlag"
  | "PenaltyIssued"
  | "PenaltyWarning"
  | "RacingIncident"
  | "DriveThroughServed"
  | "StopGoServed"
  | "MeatballFlag"
  | "BlackFlag"
  | "Disqualified"
  | "SlowZone"
  | "FcyDeploy"
  | "FcyEnd"
  | "SafetyCarDeploy"
  | "SafetyCarInThisLap"
  | "GreenFlag"
  | "WhiteFlag"
  | "RedFlagDeploy"
  | "RedFlagExtended"
  | "RedFlagEnd";

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

export type WeekendSessionType = "practice" | "qualifying" | "race";

export interface QualifyingResultPayload {
  entryId: string;
  classId: string;
  bestLapTime: number;
}

export interface WeekendProgressPayload {
  round: number;
  completedSessions: WeekendSessionType[];
  qualiResults?: QualifyingResultPayload[];
}

export type SimBackend = "native" | "mock";

export interface SessionInitPayload {
  trackName: string;
  /** Native C++ physics vs TypeScript mock fallback. */
  simBackend?: SimBackend;
  targetLaps: number;
  targetDurationSeconds?: number;
  raceFormat?: string;
  roundNumber?: number;
  /** Active weekend session when raceActive (practice / qualifying / race). */
  weekendSessionType?: WeekendSessionType;
  simTimestep: number;
  entries: Array<{
    entryId: string;
    teamName: string;
    carNumber: string;
    classId: string;
    fleetCarId?: string;
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
  /** Stable roster identity for player team drivers. */
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

export interface SignDriverContractPayload {
  listingId: string;
}

export type StaffRole = "engineer" | "mechanic" | "strategist";
export type StaffStatus = "active" | "injured" | "ill" | "poached";

export interface StaffMemberPayload {
  id?: string;
  role: string;
  name: string;
  skill: number;
  experience?: number;
  salaryPerRace?: number;
  morale?: number;
  assignedCarId?: string;
  status?: StaffStatus;
  unavailableUntilRound?: number;
  traits?: string[];
}

export type CalendarEventType = "test" | "race";

export interface CalendarEventPayload {
  round: number;
  trackId: string;
  format: string;
  eventType?: CalendarEventType;
  eventName?: string;
  /** Race month 1–12 for weather/climate display */
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

export interface TeamColorsPayload {
  primary: string;
  secondary: string;
}

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
  energy_converter?: string;
  power_target?: number;
  rev_character?: number;
  block_size?: number;
  generator_size?: number;
  buffer_size?: number;
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
  diffuser_type?: string;
  exhaust_type?: string;
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
  /** Per-axle ride height tuning (mm). */
  front_ride_height_mm?: number;
  rear_ride_height_mm?: number;
  /** Per-axle spring rate tuning (N/m). */
  front_spring_nm?: number;
  rear_spring_nm?: number;
  /** Anti-roll bar stiffness multiplier vs part baseline (0.70–1.30). */
  front_arb_stiffness?: number;
  rear_arb_stiffness?: number;
  /** Damper clickers — bump/rebound per axle (1–15, default 8). */
  front_damper_bump?: number;
  front_damper_rebound?: number;
  rear_damper_bump?: number;
  rear_damper_rebound?: number;
  /** Alignment — degrees, negative = top-in. */
  front_camber_deg?: number;
  rear_camber_deg?: number;
  front_toe_deg?: number;
  rear_toe_deg?: number;
  /** Override physics final drive (3.0–4.2); omit to use class default. */
  final_drive_ratio?: number;
  /** Race-start aero/brake baseline (weekend sheet). */
  starting_wing_delta?: number;
  starting_brake_bias?: number;
  fuel_system: string;
  brake_system: string;
  transmission: string;
  hybrid_system: string;
  engine?: EngineBuildPayload;
}

/** Per-track race weekend baseline — merged onto garage build at session start. */
export interface TrackSetupPresetPayload {
  trackId: string;
  label?: string;
  notes?: string;
  ductAirflow?: number;
  wingBaseline?: number;
  brakeBiasBaseline?: number;
  frontRideHeightMm?: number;
  rearRideHeightMm?: number;
  frontSpringNm?: number;
  rearSpringNm?: number;
  frontArbStiffness?: number;
  rearArbStiffness?: number;
  frontDamperBump?: number;
  frontDamperRebound?: number;
  rearDamperBump?: number;
  rearDamperRebound?: number;
  frontCamberDeg?: number;
  rearCamberDeg?: number;
  frontToeDeg?: number;
  rearToeDeg?: number;
  finalDriveRatio?: number;
}

export type CarAffiliation = "manufacturer" | "privateer";
export type CarAcquisition = "build" | "privateer";

export interface HiddenFaultPayload {
  id: string;
  kind: string;
  linkedPart: string;
  severity: number;
  revealed: boolean;
}

export interface CarConditionPayload {
  partHealth: Record<string, number>;
  irreparable: string[];
  hiddenFaults?: HiddenFaultPayload[];
  limpMode?: string;
  structuralSeverity?: number;
  damagedCorners?: string[];
  updatedAtRound?: number;
  updatedAfterSession?: WeekendSessionType;
}

export interface RepairCarConditionPayload {
  carId: string;
  parts?: string[];
  rebuild?: boolean;
  reveal?: boolean;
}

export interface FleetCarPayload {
  id: string;
  carNumber: string;
  classId: string;
  affiliation: CarAffiliation;
  acquisition: CarAcquisition;
  /** Homologated WEC entry (default) or non-points experimental programme. */
  entryMode?: FleetEntryMode;
  /** Shared id for all cars in one experimental design within a class. */
  experimentalProgramId?: string;
  manufacturerId?: string;
  platformId?: string;
  build: CarBuildPayload;
  carConfigPath: string;
  /** Per-track session setup sheets for this car (keyed by trackId). */
  trackSetupPresets?: Record<string, TrackSetupPresetPayload>;
  /** Driver roster ids assigned to this car for race stints (exclusive per driver). */
  assignedDriverIds?: string[];
  carCondition?: CarConditionPayload;
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
  experimental: {
    maxCopiesManufacturer: number;
    maxCopiesPrivateer: number;
    privateerProgrammeFee: number;
    manufacturerUnitMultiplier: number;
    copyUnitMultiplier: number;
    privateerUnitMultiplier: number;
    opsFee: number;
    fanExposureBase: number;
    rdMultiplier: number;
    hypercarManufacturerExpMax: number;
    hypercarStandaloneExpCopies: number;
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

/** Career state captured at season start — restored by restart_season. */
export interface SeasonStartSnapshotPayload {
  seasonYear: number;
  budget: number;
  rdPoints: number;
  sponsors: SponsorContractPayload[];
  unlockedParts: string[];
  calendar: CalendarEventPayload[];
  currentRound: number;
  fleet: FleetCarPayload[];
  driverRoster: DriverProfilePayload[];
  staff: StaffMemberPayload[];
  driverMarket: DriverMarketListingPayload[];
  driverMarketRefreshCount: number;
  driverMarketRound: number;
  aiRivalSeason: AiRivalSeasonPayload;
  weekendTireCompound?: string;
  trackSetupPresets?: Record<string, TrackSetupPresetPayload>;
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
  /** In-progress team creation wizard state (cleared when team is founded). */
  teamCreationDraft?: TeamCreationDraftPayload | null;
  /** @deprecated Use fleet + activeCarId */
  playerClassId?: string;
  teamColors?: TeamColorsPayload;
  /** @deprecated Use fleet */
  carBuild?: CarBuildPayload | null;
  fleet?: FleetCarPayload[];
  activeCarId?: string;
  /** Fleet car the player drives in the race */
  playerCarId?: string;
  driverRoster?: DriverProfilePayload[];
  /** True after founding/buying a manufacturer build until first saveCarBuild */
  carBuildGuidePending?: boolean;
  /** Soft / Medium / Hard — changed during race weekend, not in car design */
  weekendTireCompound?: string;
  /** Saved per-track setup sheets keyed by trackId */
  trackSetupPresets?: Record<string, TrackSetupPresetPayload>;
  /** In-progress multi-session weekend for the current round. */
  weekendProgress?: WeekendProgressPayload;
  /** Available drivers to sign — refreshed each round or manually */
  driverMarket?: DriverMarketListingPayload[];
  driverMarketRefreshCount?: number;
  driverMarketRound?: number;
  /** Lightweight off-week state for AI rival teams (budget, form, standings). */
  aiRivalSeason?: AiRivalSeasonPayload;
  /** True when every scoring round on the calendar is finished. */
  seasonComplete?: boolean;
  /** Championship standings and end-of-season payouts (set once when season completes). */
  seasonSummary?: SeasonSummaryPayload;
  /** Saved when a season begins; used to rewind the current season. */
  seasonStartSnapshot?: SeasonStartSnapshotPayload;
}

export interface SeasonStandingEntryPayload {
  position: number;
  teamName: string;
  classId: string;
  championshipPoints: number;
  isPlayerTeam?: boolean;
}

export interface DriverStandingEntryPayload {
  position: number;
  name: string;
  teamName: string;
  classId: string;
  championshipPoints: number;
  isPlayerDriver?: boolean;
}

export interface SeasonSummaryPayload {
  seasonYear: number;
  teamStandings: Record<string, SeasonStandingEntryPayload[]>;
  driverStandings: Record<string, DriverStandingEntryPayload[]>;
  playerTeamPositions: Record<string, number>;
  racePointsEarned: number;
  payouts: FinanceLineItemPayload[];
  totalPayout: number;
}

export type AiRivalArc =
  | "hot_streak"
  | "rebuilding"
  | "defending_champion"
  | "underdog"
  | null;

export interface AiRivalTeamPayload {
  teamName: string;
  primaryClassId: string;
  budget: number;
  rdTier: number;
  engineerSkill: number;
  form: number;
  championshipPoints: number;
  racesScored: number;
  arc: AiRivalArc;
  lastRoundPoints: number;
  driversSigned: number;
  isPlayerTeam?: boolean;
}

export interface AiRivalSeasonPayload {
  seasonYear: number;
  teams: AiRivalTeamPayload[];
  drivers: DriverChampionshipPayload[];
  rosterOverrides?: Record<string, DriverProfilePayload[]>;
  marketSignedListingIds?: string[];
  lastMarketNote?: string;
  lastOffWeekHeadline?: string;
  lastOffWeekEvents?: AiRivalOffWeekEventPayload[];
}

export interface AiRivalOffWeekEventPayload {
  type: "points" | "form" | "rd" | "market" | "arc" | "standings";
  teamName: string;
  classId?: string;
  text: string;
}

export interface DriverChampionshipPayload {
  driverKey: string;
  name: string;
  nationality: string;
  teamName: string;
  classId: string;
  championshipPoints: number;
  lastRoundPoints: number;
  racesScored: number;
  isPlayerDriver?: boolean;
}

export interface ClassInfoPayload {
  id: string;
  displayName: string;
  description: string;
  powerCapHp: number;
  minWeightKg: number;
  maxWeightKg: number;
  maxStintHours: number;
  /** Allowed part types per garage slot (from class_rules.txt legal_* lists). */
  legalParts?: Partial<Record<string, string[]>>;
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
  sponsorOffers: SponsorOfferPayload[];
  carPlatforms: CarPlatformPayload[];
  fleetRules: FleetRulesPayload;
  driverStatDefs: DriverStatDefPayload[];
  driverPointPool: number;
  lemansDriverCount: number;
  driverMarketPreview: DriverMarketListingPayload[];
  defaultEngines: Record<string, EngineBuildPayload>;
  assemblyRules: AssemblyRulePayload[];
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
  /** How many identical entries to add (same class programme). */
  quantity?: number;
  /** Experimental (EXP) entries do not score championship points. */
  entryMode?: FleetEntryMode;
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
  trackTempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  visibilityKm: number;
}

export interface SurfaceHazardSummaryPayload {
  sectorIndex: number;
  kind: string;
  gripMultiplier: number;
}

export interface RaceControlPayload {
  fcyActive: boolean;
  scActive: boolean;
  flagPhase: string;
  sectorFlags: number[];
  activeIncidentEntryId?: string;
  scLapsRemaining: number;
  obstructionsOnTrack: number;
  whiteFlagActive: boolean;
  redFlagActive?: boolean;
  redFlagSecondsRemaining?: number;
  surfaceHazards: SurfaceHazardSummaryPayload[];
  trackWetness: number;
  ambientTempC: number;
  trackTempC: number;
  trackGripEvolution: number;
  rainIntensity: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  visibilityKm: number;
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
  weekendSessionType?: WeekendSessionType;
  /** Saved session log id (dev tools / post-mortem). */
  sessionLogId?: string;
  /** Next session in the weekend, or null when the weekend is finished. */
  nextWeekendSession?: WeekendSessionType | null;
  results: Array<{
    entryId: string;
    teamName: string;
    carNumber: string;
    classId: string;
    position: number;
    bestLapTime?: number;
    retired?: boolean;
    retireReason?: string;
  }>;
}

export interface SubmitCommandPayload {
  entryId: string;
  command: string;
}

export interface HireStaffPayload {
  role: string;
  name: string;
  skill: number;
}

export interface RdInvestPayload {
  partId: string;
  points: number;
}

export interface CompleteRoundPayload {
  position: number;
  classId: string;
}

export interface SignSponsorPayload {
  offerId: string;
}

export interface DropSponsorPayload {
  offerId: string;
}

export interface ErrorPayload {
  message: string;
}

export interface GetTrackPreviewPayload {
  trackId: string;
}

export interface TrackPreviewPayload {
  trackId: string;
  geometry: TrackGeometryPayload;
}

export interface AskEngineerPayload {
  entryId: string;
  question?: string;
}

export interface SaveTrackSetupPayload {
  trackId: string;
  preset: TrackSetupPresetPayload;
}

export interface SessionCarSetupPayload {
  carId: string;
  preset: TrackSetupPresetPayload;
}

/** Optional payload on start_round — applies per-car chassis setup before building the grid. */
export interface StartRoundPayload {
  trackId?: string;
  carSetups?: SessionCarSetupPayload[];
  /** Which weekend session to run (defaults to the next incomplete step). */
  sessionType?: WeekendSessionType;
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
  permissions: ClientMessageType[];
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

export interface ErrorPayload {
  message: string;
  code?: "join_required" | "forbidden" | "invalid_message";
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
  | "end_session"
  | "reload_definitions"
  | "submit_command"
  | "hire_staff"
  | "rd_invest"
  | "complete_round"
  | "start_round"
  | "continue_weekend_session"
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
  | "save_track_setup"
  | "ask_engineer"
  | "get_engineer_status"
  | "ask_garage_engineer"
  | "repair_car_condition"
  | "start_next_season"
  | "restart_season"
  | "finalize_season";

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

export function serverMessage<T>(
  type: ServerMessageType,
  payload: T,
): ServerMessage<T> {
  return { protocol: PROTOCOL_VERSION, type, payload };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as ClientMessage;
    if (msg.protocol !== PROTOCOL_VERSION) return null;
    const allowed: ClientMessageType[] = [
      "join_session",
      "set_time_scale",
      "pause",
      "resume",
      "restart_race",
      "end_session",
      "reload_definitions",
      "submit_command",
      "hire_staff",
      "rd_invest",
      "complete_round",
      "start_round",
      "continue_weekend_session",
      "create_team",
      "save_team_creation_draft",
      "save_car_build",
      "buy_car",
      "set_active_car",
      "set_player_entry",
      "remove_car",
      "save_driver_roster",
      "refresh_driver_market",
      "sign_driver_contract",
      "save_team_colors",
      "sign_sponsor",
      "drop_sponsor",
      "new_game",
      "get_track_preview",
      "set_weekend_tire_compound",
      "save_track_setup",
      "ask_engineer",
      "get_engineer_status",
      "ask_garage_engineer",
      "repair_car_condition",
      "start_next_season",
      "restart_season",
      "finalize_season",
    ];
    if (!allowed.includes(msg.type)) return null;
    return msg;
  } catch {
    return null;
  }
}
