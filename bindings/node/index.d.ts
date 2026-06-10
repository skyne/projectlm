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
  tireCompound?: string;
  tireTempC?: number;
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;
  coolantTempC?: number;
  hybridDeployMJ: number;
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
  lateralOffsetM?: number;
  headingError?: number;
  poseIncludesLateral?: boolean;
  carLengthM?: number;
  carWidthM?: number;
  driverName?: string;
  driverMode?: string;
  driverStamina?: number;
  driverPressure?: number;
  driverMistakeRisk?: number;
  activeDriverIndex?: number;
  driverRoster?: Array<{
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
  }>;
  lastMistakeKind?: string;
  lastMistakeRemainingSec?: number;
  lastMistakeWearPct?: number;
  lastMistakeWheel?: string;
  wearBoostRemainingSec?: number;
  wearBoostMultiplier?: number;
  overtaking?: boolean;
  blocked?: boolean;
  pitRemainingSec?: number;
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
  partIrreparable?: string[];
  partRepairSec?: Record<string, number>;
  physicallyRepairable?: boolean;
  sessionRepairable?: boolean;
  totalRepairSec?: number;
  remainingSessionSec?: number;
  garageRebuildActive?: boolean;
  garageRebuildRemainingSec?: number;
  onFire?: boolean;
  tyreDeflation?: Record<string, string>;
  limpMode?: string;
  limpReason?: string;
  structuralSeverity?: number;
  suspectedIssues?: boolean;
  hiddenFaults?: Array<{
    id: string;
    kind: string;
    linkedPart: string;
    severity: number;
    revealed: boolean;
  }>;
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
  unstableOnTrack?: boolean;
  riskyRejoinSec?: number;
  lastContactSeverity?: number;
  surfaceZone?: string;
}

export type SimEventType =
  | 'sector_cross'
  | 'lap_complete'
  | 'pit_enter'
  | 'pit_exit'
  | 'retirement'
  | 'race_complete'
  | 'overtake'
  | 'collision'
  | 'blocked'
  | 'command_ack'
  | 'stranded'
  | 'recovery_dispatched'
  | 'track_clear'
  | 'surface_hazard'
  | 'surface_cleared'
  | 'blue_flag'
  | 'penalty_issued'
  | 'drive_through_served'
  | 'stop_go_served'
  | 'meatball_flag'
  | 'black_flag'
  | 'disqualified'
  | 'slow_zone'
  | 'fcy_deploy'
  | 'fcy_end'
  | 'safety_car_deploy'
  | 'safety_car_in_this_lap'
  | 'green_flag'
  | 'white_flag'
  | 'unknown';

export interface SimEvent {
  type: SimEventType;
  entryId: string;
  lap: number;
  sectorIndex: number;
  timestamp: number;
  message: string;
}

export interface TrackPointXZ {
  x: number;
  z: number;
}

export interface TrackSectorInfo {
  name: string;
  startT: number;
  endT: number;
}

export interface TrackGeometry {
  name: string;
  lapLength: number;
  points: TrackPointXZ[];
  sectors: TrackSectorInfo[];
}

export interface StaffMemberPayload {
  role: string;
  name: string;
  skill: number;
}

export interface CalendarEventPayload {
  round: number;
  trackId: string;
  format: string;
  completed: boolean;
  championshipPoints: number;
}

export interface MetaStatePayload {
  teamName: string;
  budget: number;
  rdPoints: number;
  playerEntryId: string;
  seasonYear: number;
  currentRound: number;
  staff: StaffMemberPayload[];
  unlockedParts: string[];
  calendar: CalendarEventPayload[];
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
  centerDistance?: number;
  centerLateralM?: number;
  spanMeters?: number;
  lateralSpanM?: number;
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

export interface SimSession {
  initFromRaceConfig(path: string): boolean;
  reloadDefinitions(): boolean;
  restartRace(): boolean;
  tick(deltaTime: number): void;
  getSnapshots(): CarSnapshot[];
  drainEvents(): SimEvent[];
  getTrackGeometry(): TrackGeometry;
  isRaceComplete(): boolean;
  getRaceTime(): number;
  getRaceControl(): RaceControlPayload;
  submitCommand(entryId: string, command: string): boolean;
  debugRaceControl(payload: Record<string, unknown>): string | null;
}

declare const sim: SimSession;
export default sim;
