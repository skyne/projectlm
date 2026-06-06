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
  hybridDeployMJ: number;
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

export type SimEventType =
  | 'sector_cross'
  | 'lap_complete'
  | 'pit_enter'
  | 'pit_exit'
  | 'retirement'
  | 'race_complete'
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

export interface SimSession {
  initFromRaceConfig(path: string): boolean;
  reloadDefinitions(): boolean;
  restartRace(): boolean;
  tick(deltaTime: number): void;
  getSnapshots(): CarSnapshot[];
  drainEvents(): SimEvent[];
  getTrackGeometry(): TrackGeometry;
  isRaceComplete(): boolean;
  submitCommand(entryId: string, command: string): boolean;
  getRaceTime(): number;
  getRaceControl(): {
    fcyActive: boolean;
    scActive: boolean;
    trackWetness: number;
    ambientTempC: number;
    trackGripEvolution: number;
    rainIntensity?: number;
    weatherPhase?: string;
    forecastRainInSeconds?: number;
  };
  getReplayLog(): Array<{ timestamp: number; entryId: string; command: string }>;
  getRngSeed(): number;
}

declare const sim: SimSession;
export default sim;
