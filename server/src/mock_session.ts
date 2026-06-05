/**
 * Dev fallback when @projectlm/native is not built.
 * Replace with N-API addon: cd bindings/node && npm run build
 */
import * as fs from "fs";
import * as path from "path";
import type {
  CarSnapshot,
  LapTimingSnapshot,
  SimEvent,
  TrackGeometryPayload,
} from "./ws_protocol";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface RaceConfig {
  trackConfigPath: string;
  targetLaps: number;
  simTimestep: number;
  entriesPath: string;
}

interface TrackMapLabel {
  text: string;
  x: number;
  z: number;
  anchor?: "start" | "middle" | "end";
}

interface TrackJson {
  name: string;
  closed?: boolean;
  lap_length?: number;
  interpolation?: string;
  control_points: Vec3[];
  display_polyline?: Vec3[];
  map_labels?: TrackMapLabel[];
  sectors: Array<{ name: string; start_t: number; end_t: number }>;
}

interface CarState {
  entryId: string;
  teamName: string;
  carNumber: number;
  classId: string;
  distance: number;
  lap: number;
  speed: number;
  fuel: number;
  tireWear: number;
  engineHealth: number;
  sectorIndex: number;
  retired: boolean;
  currentLapTime: number;
  currentSectorTime: number;
  lastLapTime: number;
  bestLapTime: number;
  currentLapSectorTimes: number[];
  lapHistory: LapTimingSnapshot[];
}

function sectorAtDistance(
  sectors: TrackJson["sectors"],
  distance: number,
  lapLength: number,
): number {
  if (sectors.length === 0) return 0;
  const t = (((distance % lapLength) + lapLength) % lapLength) / lapLength;
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i];
    if (t >= sector.start_t && t < sector.end_t) return i;
  }
  return sectors.length - 1;
}

function makeCarState(
  entry: { entryId: string; teamName: string; carNumber: number; classId: string },
  gridIndex: number,
): CarState {
  return {
    ...entry,
    distance: gridIndex * 120,
    lap: 1,
    speed: CLASS_SPEED[entry.classId] ?? 85,
    fuel: 100,
    tireWear: 0,
    engineHealth: 100,
    sectorIndex: 0,
    retired: false,
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
  };
}

function computeGapToLeader(car: CarState, leader: CarState, lapLength: number): number {
  const lapDiff = leader.lap - car.lap;
  let distanceGap = leader.distance - car.distance;
  distanceGap += lapDiff * lapLength;
  const refSpeed = Math.max(leader.speed, 1);
  return Math.max(0, distanceGap / refSpeed);
}

interface SamplePoint {
  distance: number;
  normalizedT: number;
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
}

const CLASS_SPEED: Record<string, number> = {
  Hypercar: 92,
  LMGT3: 78,
  LMP2: 85,
  solo: 88,
};

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function loadTrack(repoRoot: string, trackPath: string) {
  const abs = path.join(repoRoot, trackPath);
  const track = JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
  const points = track.display_polyline ?? track.control_points;
  const useLinear =
    track.interpolation === "linear" || track.display_polyline !== undefined;
  const closed = track.closed !== false;
  const segmentCount = closed ? points.length : points.length - 1;
  const rawSamples: Array<{ x: number; z: number }> = [];

  if (useLinear) {
    for (let i = 0; i < segmentCount; i++) {
      const p1 = points[i % points.length];
      const p2 = points[(i + 1) % points.length];
      rawSamples.push({ x: p1.x, z: p1.z });
      const steps = 4;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        rawSamples.push({
          x: p1.x + t * (p2.x - p1.x),
          z: p1.z + t * (p2.z - p1.z),
        });
      }
    }
  } else {
    for (let i = 0; i < segmentCount; i++) {
      const p0 = points[(i - 1 + points.length) % points.length];
      const p1 = points[i % points.length];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        rawSamples.push({
          x: catmull(p0.x, p1.x, p2.x, p3.x, t),
          z: catmull(p0.z, p1.z, p2.z, p3.z, t),
        });
      }
    }
  }

  let total = 0;
  const cumulative = [0];
  for (let i = 1; i < rawSamples.length; i++) {
    total += Math.hypot(
      rawSamples[i].x - rawSamples[i - 1].x,
      rawSamples[i].z - rawSamples[i - 1].z,
    );
    cumulative.push(total);
  }

  const lapLength = track.lap_length ?? total;
  const scale = total > 0 ? lapLength / total : 1;
  const samples: SamplePoint[] = rawSamples.map((pt, i) => {
    const dist = cumulative[i] * scale;
    const prev = rawSamples[(i - 1 + rawSamples.length) % rawSamples.length];
    const next = rawSamples[(i + 1) % rawSamples.length];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    return {
      distance: dist,
      normalizedT: lapLength > 0 ? dist / lapLength : 0,
      x: pt.x,
      z: pt.z,
      tangentX: tx / len,
      tangentZ: tz / len,
    };
  });

  return { track, samples, lapLength };
}

function parseRaceConfig(repoRoot: string, configPath: string): RaceConfig {
  const abs = path.isAbsolute(configPath) ? configPath : path.join(repoRoot, configPath);
  const config: RaceConfig = {
    trackConfigPath: "tracks/sample_circuit.json",
    targetLaps: 1,
    simTimestep: 0.1,
    entriesPath: "",
  };
  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "track_config") config.trackConfigPath = val;
    else if (key === "target_laps") config.targetLaps = parseInt(val, 10);
    else if (key === "sim_timestep") config.simTimestep = parseFloat(val);
    else if (key === "entries") config.entriesPath = val;
  }
  return config;
}

function parseEntries(repoRoot: string, entriesPath: string) {
  const rows: Array<{
    entryId: string;
    teamName: string;
    carNumber: number;
    classId: string;
  }> = [];
  for (const line of fs.readFileSync(path.join(repoRoot, entriesPath), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("entry=")) continue;
    const parts = trimmed.slice(6).split(",");
    if (parts.length < 4) continue;
    const grid = parseInt(parts[3].trim(), 10);
    if (!Number.isFinite(grid) || grid <= 0) continue;
    const carNumber =
      parts.length >= 5 ? parseInt(parts[4].trim(), 10) : grid;
    rows.push({
      entryId: `entry-${grid}`,
      teamName: parts[0].trim(),
      carNumber: Number.isFinite(carNumber) && carNumber > 0 ? carNumber : grid,
      classId: parts[2].trim(),
    });
  }
  return rows;
}

export class MockSimSession {
  private repoRoot: string;
  private configPath = "";
  private raceConfig: RaceConfig | null = null;
  private trackJson: TrackJson | null = null;
  private samples: SamplePoint[] = [];
  private lapLength = 1;
  private cars: CarState[] = [];
  private raceTime = 0;
  private pendingEvents: SimEvent[] = [];
  private raceComplete = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  initFromRaceConfig(configPath: string): boolean {
    try {
      this.configPath = configPath;
      this.raceConfig = parseRaceConfig(this.repoRoot, configPath);
      const loaded = loadTrack(this.repoRoot, this.raceConfig.trackConfigPath);
      this.trackJson = loaded.track;
      this.samples = loaded.samples;
      this.lapLength = loaded.lapLength;

      const entries = this.raceConfig.entriesPath
        ? parseEntries(this.repoRoot, this.raceConfig.entriesPath)
        : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" }];

      this.cars = entries.map((e, i) => makeCarState(e, i));
      for (const car of this.cars) {
        car.sectorIndex = sectorAtDistance(this.trackJson!.sectors, car.distance, this.lapLength);
      }
      this.raceTime = 0;
      this.pendingEvents = [];
      this.raceComplete = false;
      return true;
    } catch {
      return false;
    }
  }

  tick(deltaTime: number): void {
    if (this.raceComplete || !this.raceConfig || !this.trackJson) return;
    this.raceTime += deltaTime;
    for (const car of this.cars) {
      if (car.retired) continue;

      const prevSector = car.sectorIndex;
      car.currentLapTime += deltaTime;
      car.currentSectorTime += deltaTime;
      car.distance += car.speed * deltaTime;

      const lapComplete = car.distance >= this.lapLength;
      if (lapComplete) {
        car.currentLapSectorTimes.push(car.currentSectorTime);
        car.lapHistory.push({
          lapNumber: car.lap,
          lapTime: car.currentLapTime,
          sectorTimes: [...car.currentLapSectorTimes],
        });
        car.lastLapTime = car.currentLapTime;
        if (car.bestLapTime <= 0 || car.currentLapTime < car.bestLapTime) {
          car.bestLapTime = car.currentLapTime;
        }
        this.pendingEvents.push({
          type: "LapComplete",
          entryId: car.entryId,
          lap: car.lap,
          timestamp: this.raceTime,
          message: `${car.teamName} completed lap ${car.lap}`,
        });
        car.distance -= this.lapLength;
        car.lap += 1;
        car.currentLapTime = 0;
        car.currentSectorTime = 0;
        car.currentLapSectorTimes = [];
      } else {
        const newSector = sectorAtDistance(
          this.trackJson.sectors,
          car.distance,
          this.lapLength,
        );
        if (newSector !== prevSector) {
          car.currentLapSectorTimes.push(car.currentSectorTime);
          this.pendingEvents.push({
            type: "SectorCross",
            entryId: car.entryId,
            lap: car.lap,
            sectorIndex: prevSector,
            timestamp: this.raceTime,
            message: `${car.teamName} crossed sector ${prevSector}`,
          });
          car.currentSectorTime = 0;
          car.sectorIndex = newSector;
        }
      }

      if (lapComplete) {
        car.sectorIndex = sectorAtDistance(
          this.trackJson.sectors,
          car.distance,
          this.lapLength,
        );
      }
    }
    if (this.cars.every((c) => c.retired || c.lap > this.raceConfig!.targetLaps)) {
      this.raceComplete = true;
      this.pendingEvents.push({
        type: "RaceComplete",
        timestamp: this.raceTime,
        message: "Race complete",
      });
    }
  }

  getSnapshots(): CarSnapshot[] {
    const board = [...this.cars].sort((a, b) => b.lap - a.lap || b.distance - a.distance);
    const leader = board[0];
    return board.map((car, rank) => {
      const d = ((car.distance % this.lapLength) + this.lapLength) % this.lapLength;
      const sample = this.samples.find((s) => s.distance >= d) ?? this.samples[0];
      return {
        entryId: car.entryId,
        teamName: car.teamName,
        carNumber: car.carNumber,
        classId: car.classId,
        lap: car.lap,
        distance: car.distance,
        normalizedT: sample.normalizedT,
        speed: car.speed,
        rpm: 6000,
        fuel: car.fuel,
        tireWear: car.tireWear,
        engineHealth: car.engineHealth,
        sectorIndex: car.sectorIndex,
        racePosition: rank + 1,
        inPit: false,
        retired: car.retired,
        currentLapTime: car.currentLapTime,
        currentSectorTime: car.currentSectorTime,
        lastLapTime: car.lastLapTime,
        bestLapTime: car.bestLapTime,
        gapToLeader: leader ? computeGapToLeader(car, leader, this.lapLength) : 0,
        currentLapSectorTimes: [...car.currentLapSectorTimes],
        lapHistory: car.lapHistory.map((lap) => ({
          lapNumber: lap.lapNumber,
          lapTime: lap.lapTime,
          sectorTimes: [...lap.sectorTimes],
        })),
        position: { x: sample.x, y: 0, z: sample.z },
        tangent: { x: sample.tangentX, y: 0, z: sample.tangentZ },
      };
    });
  }

  drainEvents(): SimEvent[] {
    const drained = this.pendingEvents;
    this.pendingEvents = [];
    return drained;
  }

  getTrackGeometry(): TrackGeometryPayload {
    if (!this.trackJson) {
      return { name: "Unknown", lapLength: 0, closed: true, polyline: [], sectors: [] };
    }
    const polyline =
      this.trackJson.display_polyline?.map((p) => ({ x: p.x, z: p.z })) ??
      this.samples.map((s) => ({ x: s.x, z: s.z }));
    return {
      name: this.trackJson.name,
      lapLength: this.lapLength,
      closed: true,
      polyline,
      mapLabels: this.trackJson.map_labels,
      sectors: this.trackJson.sectors.map((s) => {
        const midT = (s.start_t + s.end_t) * 0.5;
        const pt = this.samples[Math.round(midT * (this.samples.length - 1))];
        return {
          name: s.name,
          startT: s.start_t,
          endT: s.end_t,
          labelX: pt?.x ?? 0,
          labelZ: pt?.z ?? 0,
        };
      }),
    };
  }

  reloadDefinitions(): boolean {
    if (!this.configPath) return false;
    return this.initFromRaceConfig(this.configPath);
  }

  restartRace(): boolean {
    if (!this.raceConfig || !this.trackJson) return false;

    const entries = this.raceConfig.entriesPath
      ? parseEntries(this.repoRoot, this.raceConfig.entriesPath)
      : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" }];

    this.cars = entries.map((e, i) => makeCarState(e, i));
    for (const car of this.cars) {
      car.sectorIndex = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
    }
    this.raceTime = 0;
    this.pendingEvents = [];
    this.raceComplete = false;
    return true;
  }

  isRaceComplete(): boolean {
    return this.raceComplete;
  }

  getRaceTime(): number {
    return this.raceTime;
  }
}
