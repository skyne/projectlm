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
}

declare const sim: SimSession;
export default sim;
