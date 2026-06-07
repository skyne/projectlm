/**
 * Dev fallback when @projectlm/native is not built.
 * Replace with N-API addon: cd bindings/node && npm run build
 */
import * as fs from "fs";
import * as path from "path";
import type {
  CarSnapshot,
  LapTimingSnapshot,
  RaceControlPayload,
  SimEvent,
  TrackGeometryPayload,
} from "./ws_protocol";
import {
  buildWeatherForecast,
  initWeatherState,
  tickWeatherState,
  weatherProfileForId,
  type WeatherProfile,
  type WeatherState,
} from "./weather_model";
import { parseCarNumber, parseEntries as parseEntriesFromConfig } from "./config_parser";
import {
  normalizeTyreTread,
  tyreCompoundId,
  tyreGripScale,
  type TyreTread,
} from "./tyre_grip";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface RaceConfig {
  trackConfigPath: string;
  targetLaps: number;
  targetDurationSeconds: number;
  simTimestep: number;
  entriesPath: string;
  classRulesPath: string;
  staffConfigPath: string;
  sessionMode: string;
  weatherProfile: string;
  rngSeed: number;
  ambientTempC: number;
  weatherResolved: boolean;
  weatherTrackId: string;
  weatherMonth: number;
  weatherLabel: string;
  weatherBiome: string;
  resolvedProfile: WeatherProfile;
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
  carNumber: string;
  classId: string;
  distance: number;
  lap: number;
  speed: number;
  fuel: number;
  tireWear: number;
  tireWearFL: number;
  tireWearFR: number;
  tireWearRL: number;
  tireWearRR: number;
  tireTempC: number;
  coolantTempC: number;
  engineHealth: number;
  partHealth: Record<string, number>;
  tyreDeflation: Record<string, "soft" | "flat">;
  limpMode: string;
  sectorIndex: number;
  retired: boolean;
  retireReason: string;
  currentLapTime: number;
  currentSectorTime: number;
  lastLapTime: number;
  bestLapTime: number;
  currentLapSectorTimes: number[];
  lapHistory: LapTimingSnapshot[];
  inPit: boolean;
  pitQueued: boolean;
  pitRemainingSec: number;
  pitPhase: "driving_in" | "at_box" | "driving_out" | null;
  pitLaneDistance: number;
  pitServiceDuration: number;
  pitServiceElapsed: number;
  pendingPitPlan: ReturnType<typeof parsePitCommand> | null;
  driverStamina: number;
  activeDriverIndex: number;
  driverRoster: Array<{ name: string; active: boolean }>;
  stintTimeSec: number;
  driverMode: "push" | "normal" | "conserve";
  hybridStrategy: "balanced" | "deploy" | "harvest" | "hold";
  hybridDeployMJ: number;
  hybridBudgetMJ: number;
  pitCount: number;
  totalPitSeconds: number;
  fuelTankCapacity: number;
  maxDriverStintSeconds: number;
  startingCompound?: "soft" | "medium" | "hard";
  tyreTread: "slick" | "intermediate" | "wet";
  inGarage: boolean;
}

const PIT_LANE_FRACTION = 0.06;
const PIT_LANE_SPEED_MS = 60 / 3.6;
const PIT_LATERAL_OFFSET_M = 10;

const TANK_LITERS: Record<string, number> = {
  Hypercar: 110,
  LMGT3: 100,
  LMP2: 100,
  solo: 100,
};

const MAX_STINT_SECONDS: Record<string, number> = {
  Hypercar: 3.5 * 3600,
  LMP2: 3 * 3600,
  LMGT3: 2.5 * 3600,
};

function tankForClass(classId: string): number {
  return TANK_LITERS[classId] ?? 100;
}

function parsePitCommand(command: string): {
  fuelLiters: number;
  changeTyres: boolean;
  compound: "soft" | "medium" | "hard";
  tyreTread: TyreTread;
  driverChange: boolean;
  driverIndex: number;
  repairEngine: boolean;
  repairBody: boolean;
  repairParts: string[];
} {
  let fuelLiters = 0;
  let changeTyres = false;
  let compound: "soft" | "medium" | "hard" = "medium";
  let tyreTread: TyreTread = "slick";
  let driverChange = false;
  let driverIndex = -1;
  let repairEngine = false;
  let repairBody = false;
  const repairParts: string[] = [];
  for (const segment of command.split("|")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    const val = segment.slice(eq + 1).trim();
    if (key === "fuel") fuelLiters = parseFloat(val) || 0;
    else if (key === "tires" && (val === "all" || val === "full")) changeTyres = true;
    else if (key === "compound") {
      const c = val.toLowerCase();
      if (c === "soft" || c === "hard" || c === "medium") compound = c;
    } else if (key === "tyre_tread" || key === "tire_tread")
      tyreTread = normalizeTyreTread(val);
    else if (key === "wet_tyres" || key === "wet_tires")
      tyreTread = val === "1" || val.toLowerCase() === "true" ? "wet" : "slick";
    else if (key === "intermediate_tyres" || key === "intermediate_tires")
      tyreTread =
        val === "1" || val.toLowerCase() === "true" ? "intermediate" : "slick";
    else if (key === "driver_change" || key === "driver")
      driverChange = val === "1" || val.toLowerCase() === "true";
    else if (key === "driver_index") driverIndex = parseInt(val, 10);
    else if (key === "repairs") {
      for (const tok of val.split(",")) {
        const t = tok.trim().toLowerCase();
        if (!t) continue;
        repairParts.push(t);
        if (t === "engine") repairEngine = true;
        if (t === "body" || t === "bodywork") repairBody = true;
      }
    }
    else if (key === "tires" && val && val !== "all" && val !== "full") {
      changeTyres = true;
    }
  }
  return { fuelLiters, changeTyres, compound, tyreTread, driverChange, driverIndex, repairEngine, repairBody, repairParts };
}

function sectorAtDistance(
  sectors: TrackJson["sectors"],
  distance: number,
  lapLength: number,
): number {
  if (sectors.length === 0) return 0;
  if (distance < 0) return 0;
  const t = (((distance % lapLength) + lapLength) % lapLength) / lapLength;
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i];
    if (t >= sector.start_t && t < sector.end_t) return i;
  }
  return sectors.length - 1;
}

function gridNumberFromEntryId(entryId: string): number {
  const match = entryId.match(/^entry-(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function gridSpacingM(classId: string): number {
  const lengthM =
    classId === "Hypercar"
      ? 5.3
      : classId === "LMGT3"
        ? 4.85
        : classId === "LMP2"
          ? 4.75
          : 5.0;
  return lengthM + 2.0;
}

function gridDistanceForEntry(entry: {
  entryId: string;
  classId: string;
}): number {
  const grid = gridNumberFromEntryId(entry.entryId);
  return -(grid - 1) * gridSpacingM(entry.classId);
}

function poseAtRaceDistance(
  distance: number,
  samples: SamplePoint[],
): SamplePoint {
  const start = samples[0];
  if (!start || distance >= 0) {
    const lapLength = samples[samples.length - 1]?.distance ?? 1;
    const d = ((distance % lapLength) + lapLength) % lapLength;
    return samples.find((s) => s.distance >= d) ?? start;
  }
  return {
    distance,
    normalizedT: 0,
    x: start.x + start.tangentX * distance,
    z: start.z + start.tangentZ * distance,
    tangentX: start.tangentX,
    tangentZ: start.tangentZ,
  };
}

function makeCarState(
  entry: { entryId: string; teamName: string; carNumber: string; classId: string },
): CarState {
  const tank = tankForClass(entry.classId);
  return {
    ...entry,
    distance: gridDistanceForEntry(entry),
    lap: 1,
    speed: CLASS_SPEED[entry.classId] ?? 85,
    fuel: tank,
    tireWear: 0,
    tireWearFL: 0,
    tireWearFR: 0,
    tireWearRL: 0,
    tireWearRR: 0,
    tireTempC: 88,
    coolantTempC: 82,
    engineHealth: 100,
    partHealth: {},
    tyreDeflation: {},
    limpMode: "none",
    sectorIndex: 0,
    retired: false,
    retireReason: "",
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
    inPit: false,
    pitQueued: false,
    pitRemainingSec: 0,
    pitPhase: null,
    pitLaneDistance: 0,
    pitServiceDuration: 0,
    pitServiceElapsed: 0,
    pendingPitPlan: null,
    driverStamina: 100,
    activeDriverIndex: 0,
    driverMode: "normal",
    hybridStrategy: "balanced",
    hybridDeployMJ: entry.classId === "Hypercar" ? 4.5 : 0,
    hybridBudgetMJ: entry.classId === "Hypercar" ? 4.5 : 0,
    pitCount: 0,
    totalPitSeconds: 0,
    fuelTankCapacity: tank,
    maxDriverStintSeconds: MAX_STINT_SECONDS[entry.classId] ?? 3 * 3600,
    driverRoster: [
      { name: `${entry.teamName} #1`, active: true },
      { name: `${entry.teamName} #2`, active: false },
      { name: `${entry.teamName} #3`, active: false },
    ],
    stintTimeSec: 0,
    tyreTread: "slick",
    inGarage: false,
  };
}

function isOpenSessionMode(mode: string): boolean {
  const lower = mode.trim().toLowerCase();
  return lower === "practice" || lower === "qualifying";
}

function placeCarInGarage(car: CarState, lapLength: number): void {
  const boxDist = pitBoxDistanceM(lapLength);
  car.inGarage = true;
  car.inPit = true;
  car.pitPhase = "at_box";
  car.pitLaneDistance = boxDist;
  car.pitServiceElapsed = 0;
  car.pitServiceDuration = 0;
  car.speed = 0;
  car.distance = 0;
  car.pitQueued = false;
  car.pendingPitPlan = null;
}

function releaseCarFromGarage(car: CarState): boolean {
  if (!car.inGarage || car.retired) return false;
  car.inGarage = false;
  car.pitPhase = "driving_out";
  car.speed = PIT_LANE_SPEED_MS;
  return true;
}

function sortCarsForBoard(cars: CarState[], timingMode: boolean): CarState[] {
  if (!timingMode) {
    return [...cars].sort((a, b) => b.lap - a.lap || b.distance - a.distance);
  }
  return [...cars].sort((a, b) => {
    const aHas = a.bestLapTime > 0;
    const bHas = b.bestLapTime > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.bestLapTime !== b.bestLapTime) {
      return a.bestLapTime - b.bestLapTime;
    }
    if (a.lastLapTime !== b.lastLapTime) return a.lastLapTime - b.lastLapTime;
    return a.entryId.localeCompare(b.entryId);
  });
}

function computeTimingGap(car: CarState, leader: CarState): number {
  if (car.bestLapTime <= 0 || leader.bestLapTime <= 0) return 0;
  return Math.max(0, car.bestLapTime - leader.bestLapTime);
}

function estimateMockPitServiceSeconds(plan: ReturnType<typeof parsePitCommand>): number {
  let total = 0;
  if (plan.fuelLiters > 0) total += plan.fuelLiters * 0.038;
  if (plan.changeTyres) total += 4 * 2.8;
  if (plan.repairEngine) total += 12;
  if (plan.repairBody) total += 8 * 4;
  return Math.max(5, total);
}

function pitLaneLengthM(lapLength: number): number {
  return lapLength * PIT_LANE_FRACTION;
}

function pitBoxDistanceM(lapLength: number): number {
  return pitLaneLengthM(lapLength) * 0.48;
}

function estimateMockPitRemaining(car: CarState, lapLength: number): number {
  const laneLen = pitLaneLengthM(lapLength);
  const boxDist = pitBoxDistanceM(lapLength);
  switch (car.pitPhase) {
    case "driving_in":
      return (
        Math.max(0, boxDist - car.pitLaneDistance) / PIT_LANE_SPEED_MS +
        Math.max(0, car.pitServiceDuration - car.pitServiceElapsed) +
        Math.max(0, laneLen - boxDist) / PIT_LANE_SPEED_MS
      );
    case "at_box":
      return (
        Math.max(0, car.pitServiceDuration - car.pitServiceElapsed) +
        Math.max(0, laneLen - boxDist) / PIT_LANE_SPEED_MS
      );
    case "driving_out":
      return Math.max(0, laneLen - car.pitLaneDistance) / PIT_LANE_SPEED_MS;
    default:
      return car.pitRemainingSec;
  }
}

function beginPitStop(car: CarState, lapLength: number): void {
  car.inPit = true;
  car.pitQueued = false;
  car.pitPhase = "driving_in";
  car.pitLaneDistance = 0;
  car.pitServiceElapsed = 0;
  car.pitServiceDuration = car.pendingPitPlan
    ? estimateMockPitServiceSeconds(car.pendingPitPlan)
    : 5;
  car.distance = 0;
  car.speed = 0;
  car.pitRemainingSec = estimateMockPitRemaining(car, lapLength);
}

function tickPitLane(car: CarState, deltaTime: number, lapLength: number): boolean {
  const laneLen = pitLaneLengthM(lapLength);
  const boxDist = pitBoxDistanceM(lapLength);

  switch (car.pitPhase) {
    case "driving_in":
      car.speed = PIT_LANE_SPEED_MS;
      car.pitLaneDistance += PIT_LANE_SPEED_MS * deltaTime;
      if (car.pitLaneDistance >= boxDist) {
        car.pitLaneDistance = boxDist;
        car.pitPhase = "at_box";
        car.speed = 0;
        car.pitServiceElapsed = 0;
        if (car.pendingPitPlan) {
          car.pitServiceDuration = estimateMockPitServiceSeconds(car.pendingPitPlan);
        }
      }
      break;
    case "at_box":
      car.speed = 0;
      if (car.inGarage) break;
      car.pitServiceElapsed += deltaTime;
      if (car.pitServiceElapsed >= car.pitServiceDuration) {
        car.pitPhase = "driving_out";
        car.speed = PIT_LANE_SPEED_MS;
      }
      break;
    case "driving_out":
      car.speed = PIT_LANE_SPEED_MS;
      car.pitLaneDistance += PIT_LANE_SPEED_MS * deltaTime;
      if (car.pitLaneDistance >= laneLen) {
        car.pitLaneDistance = laneLen;
        return true;
      }
      break;
    default:
      break;
  }

  car.pitRemainingSec = estimateMockPitRemaining(car, lapLength);
  return false;
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
    targetLaps: 0,
    targetDurationSeconds: 0,
    simTimestep: 0.1,
    entriesPath: "",
    classRulesPath: "configs/class_rules.txt",
    staffConfigPath: "",
    sessionMode: "race",
    weatherProfile: "changeable",
    rngSeed: 20260306,
    ambientTempC: 0,
    weatherResolved: false,
    weatherTrackId: "",
    weatherMonth: 6,
    weatherLabel: "",
    weatherBiome: "",
    resolvedProfile: weatherProfileForId("changeable"),
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
    else if (key === "target_duration_hours")
      config.targetDurationSeconds = parseFloat(val) * 3600;
    else if (key === "target_duration_seconds")
      config.targetDurationSeconds = parseFloat(val);
    else if (key === "sim_timestep") config.simTimestep = parseFloat(val);
    else if (key === "entries") config.entriesPath = val;
    else if (key === "class_rules") config.classRulesPath = val;
    else if (key === "staff_config") config.staffConfigPath = val;
    else if (key === "session_mode") config.sessionMode = val;
    else if (key === "weather_profile") config.weatherProfile = val;
    else if (key === "rng_seed") config.rngSeed = parseInt(val, 10) || 20260306;
    else if (key === "ambient_temp_c") config.ambientTempC = parseFloat(val);
    else if (key === "weather_resolved")
      config.weatherResolved = val === "1" || val.toLowerCase() === "true";
    else if (key === "weather_track_id") config.weatherTrackId = val;
    else if (key === "weather_month") config.weatherMonth = parseInt(val, 10) || 6;
    else if (key === "weather_biome") config.weatherBiome = val;
    else if (key === "weather_label") config.weatherLabel = val;
    else if (key === "weather_base_temp_c")
      config.resolvedProfile.baseTempC = parseFloat(val);
    else if (key === "weather_temp_drift")
      config.resolvedProfile.tempDriftPerHour = parseFloat(val);
    else if (key === "weather_base_wetness")
      config.resolvedProfile.baseWetness = parseFloat(val);
    else if (key === "weather_rain_chance")
      config.resolvedProfile.rainChancePerHour = parseFloat(val);
    else if (key === "weather_max_rain")
      config.resolvedProfile.maxRainIntensity = parseFloat(val);
    else if (key === "weather_wet_rate")
      config.resolvedProfile.wetRatePerSecond = parseFloat(val);
    else if (key === "weather_dry_rate")
      config.resolvedProfile.dryRatePerSecond = parseFloat(val);
  }
  if (!config.weatherResolved) {
    config.resolvedProfile = weatherProfileForId(config.weatherProfile);
  }
  return config;
}

function parseEntries(repoRoot: string, entriesPath: string) {
  return parseEntriesFromConfig(repoRoot, entriesPath);
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
  private pendingCommands: Array<{ entryId: string; command: string }> = [];
  private weatherProfileId = "changeable";
  private weatherProfileData: WeatherProfile = weatherProfileForId("changeable");
  private weatherLabel = "";
  private weatherBiome = "";
  private weather: WeatherState = initWeatherState("changeable", 0, 0);
  private rngSeed = 20260306;
  private rngState = 20260306;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  private random(): number {
    this.rngState += 0x6d2b79f5;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private resetWeather(): void {
    const cfg = this.raceConfig;
    this.weatherProfileId = cfg?.weatherResolved && cfg.weatherTrackId
      ? `${cfg.weatherTrackId}:${cfg.weatherMonth}`
      : cfg?.weatherProfile ?? "changeable";
    this.weatherProfileData = cfg?.resolvedProfile ?? weatherProfileForId("changeable");
    this.weatherLabel = cfg?.weatherLabel ?? "";
    this.weatherBiome = cfg?.weatherBiome ?? "";
    this.rngSeed = cfg?.rngSeed ?? 20260306;
    this.rngState = this.rngSeed;
    const ambient = cfg?.ambientTempC ?? 0;
    this.weather = initWeatherState(this.weatherProfileId, 0, ambient);
    if (cfg?.weatherResolved) {
      const p = this.weatherProfileData;
      this.weather.profileId = this.weatherProfileId;
      this.weather.ambientTempC = ambient > 0 ? ambient : p.baseTempC;
      this.weather.trackWetness = p.baseWetness;
      this.weather.rainIntensity = this.weather.trackWetness * p.maxRainIntensity;
    }
    this.applyGridTyresForWeather();
  }

  private tickWeather(deltaTime: number): void {
    const profile = this.weatherProfileData;
    const result = tickWeatherState(
      this.weather,
      profile,
      this.raceTime,
      deltaTime,
      () => this.random(),
    );

    if (result.forecastScheduled) {
      const mins = Math.ceil(this.weather.forecastRainInSeconds / 60);
      this.pendingEvents.push({
        type: "Blocked",
        timestamp: this.raceTime,
        message: `Weather: rain forecast in ${mins} min`,
      });
    }

    if (result.rainStarted) {
      this.pendingEvents.push({
        type: "Blocked",
        timestamp: this.raceTime,
        message:
          this.weather.phase === "HeavyRain"
            ? "Weather: heavy rain on track"
            : "Weather: light rain begins",
      });
    } else if (result.dryingStarted) {
      this.pendingEvents.push({
        type: "Blocked",
        timestamp: this.raceTime,
        message: "Weather: track drying",
      });
    }
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
        : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: "1", classId: "solo" }];

      this.cars = entries.map((e) => makeCarState(e));
      if (isOpenSessionMode(this.raceConfig.sessionMode)) {
        for (const car of this.cars) {
          placeCarInGarage(car, this.lapLength);
        }
      }
      for (const car of this.cars) {
        car.sectorIndex = sectorAtDistance(this.trackJson!.sectors, car.distance, this.lapLength);
      }
      this.raceTime = 0;
      this.pendingEvents = [];
      this.pendingCommands = [];
      this.raceComplete = false;
      this.resetWeather();
      return true;
    } catch {
      return false;
    }
  }

  submitCommand(entryId: string, command: string): boolean {
    this.pendingCommands.push({ entryId, command });
    return true;
  }

  private applyPendingCommands(): void {
    for (const pending of this.pendingCommands) {
      const car = this.cars.find((c) => c.entryId === pending.entryId);
      if (!car || car.retired) continue;
      const lower = pending.command.trim().toLowerCase();
      if (lower === "cancel_pit" || lower === "cancelpit") {
        car.pitQueued = false;
        continue;
      }
      if (lower === "release" || lower === "garage|exit" || lower === "garage|release") {
        releaseCarFromGarage(car);
        continue;
      }
      if (lower === "pit" || lower.startsWith("pit|") || lower === "request_pit") {
        car.pitQueued = true;
        car.pendingPitPlan = parsePitCommand(pending.command);
        continue;
      }
      if (lower.startsWith("driver_mode=")) {
        const mode = lower.slice("driver_mode=".length).trim();
        if (mode === "push" || mode === "normal" || mode === "conserve") {
          car.driverMode = mode;
        }
      }
      if (lower.startsWith("hybrid_strategy=")) {
        const strategy = lower.slice("hybrid_strategy=".length).trim();
        if (
          strategy === "balanced" ||
          strategy === "deploy" ||
          strategy === "harvest" ||
          strategy === "hold"
        ) {
          car.hybridStrategy = strategy;
        }
      }
      if (lower.startsWith("starting_compound=")) {
        if (this.raceTime > 0.5 || car.distance > 5) continue;
        const compound = lower.slice("starting_compound=".length).trim();
        if (compound === "soft" || compound === "medium" || compound === "hard") {
          car.startingCompound = compound;
        }
      }
      if (
        lower.startsWith("tyre_tread=") ||
        lower.startsWith("tire_tread=") ||
        lower.startsWith("wet_tyres=") ||
        lower.startsWith("wet_tires=") ||
        lower.startsWith("intermediate_tyres=") ||
        lower.startsWith("intermediate_tires=")
      ) {
        if (this.raceTime > 0.5 || car.distance > 5) continue;
        const eq = pending.command.indexOf("=");
        const val = eq === -1 ? "" : pending.command.slice(eq + 1).trim();
        const key = eq === -1 ? "" : lower.slice(0, eq);
        if (key === "tyre_tread" || key === "tire_tread") {
          car.tyreTread = normalizeTyreTread(val);
        } else if (key === "intermediate_tyres" || key === "intermediate_tires") {
          car.tyreTread =
            val === "1" || val.toLowerCase() === "true" ? "intermediate" : "slick";
        } else {
          car.tyreTread = val === "1" || val.toLowerCase() === "true" ? "wet" : "slick";
        }
      }
    }
    this.pendingCommands = [];
  }

  private applyGridTyresForWeather(): void {
    const wetness = this.weather.trackWetness;
    if (wetness < 0.15) return;
    const tread: TyreTread = wetness >= 0.35 ? "wet" : "intermediate";
    for (const car of this.cars) car.tyreTread = tread;
  }

  private finishPitStop(car: CarState, plan: ReturnType<typeof parsePitCommand>): void {
    const tank = tankForClass(car.classId);
    if (plan.fuelLiters > 0) {
      car.fuel = Math.min(tank, car.fuel + plan.fuelLiters);
    }
    if (plan.changeTyres) {
      car.tireWear = 0;
      car.tireWearFL = 0;
      car.tireWearFR = 0;
      car.tireWearRL = 0;
      car.tireWearRR = 0;
      car.startingCompound = plan.compound;
      car.tyreTread = plan.tyreTread;
    }
    if (plan.driverChange && car.driverRoster.length >= 2) {
      const idx =
        plan.driverIndex >= 0 && plan.driverIndex < car.driverRoster.length
          ? plan.driverIndex
          : (car.activeDriverIndex + 1) % car.driverRoster.length;
      car.activeDriverIndex = idx;
      car.driverRoster.forEach((d, i) => {
        d.active = i === idx;
      });
      car.stintTimeSec = 0;
      car.driverStamina = 100;
    }
    if (plan.repairEngine) {
      car.engineHealth = Math.min(100, car.engineHealth + 25);
      car.coolantTempC = Math.min(car.coolantTempC, 88);
      car.partHealth = { ...car.partHealth, engine: Math.min(100, (car.partHealth.engine ?? car.engineHealth) + 25) };
    }
    if (plan.repairBody) {
      car.engineHealth = Math.min(100, car.engineHealth + 10);
      for (const w of ["body_fl", "body_fr", "body_rl", "body_rr"]) {
        car.partHealth[w] = Math.min(100, (car.partHealth[w] ?? 90) + 15);
      }
    }
    if (plan.changeTyres) {
      car.tyreDeflation = {};
    }
    car.pitCount += 1;
  }

  tick(deltaTime: number): void {
    if (this.raceComplete || !this.raceConfig || !this.trackJson) return;
    this.applyPendingCommands();
    this.raceTime += deltaTime;
    this.tickWeather(deltaTime);
    for (const car of this.cars) {
      if (car.retired) continue;

      if (car.inPit) {
        car.totalPitSeconds += deltaTime;
        if (tickPitLane(car, deltaTime, this.lapLength)) {
          if (car.pendingPitPlan) {
            this.finishPitStop(car, car.pendingPitPlan);
            car.pendingPitPlan = null;
          }
          car.inPit = false;
          car.pitPhase = null;
          car.pitLaneDistance = 0;
          car.distance = pitLaneLengthM(this.lapLength);
          car.speed = PIT_LANE_SPEED_MS * 0.85;
          this.pendingEvents.push({
            type: "PitExit",
            entryId: car.entryId,
            lap: car.lap,
            timestamp: this.raceTime,
            message: `${car.teamName} exited pit lane`,
          });
        }
        continue;
      }

      const prevSector = car.sectorIndex;
      car.currentLapTime += deltaTime;
      car.currentSectorTime += deltaTime;
      car.stintTimeSec += deltaTime;

      const fuelBurn = (0.035 + car.speed / 3500) * deltaTime;
      car.fuel = Math.max(0, car.fuel - fuelBurn);

      const wearRate = (0.00035 + car.speed / 250000) * deltaTime;
      car.tireWearFL = Math.min(1, car.tireWearFL + wearRate);
      car.tireWearFR = Math.min(1, car.tireWearFR + wearRate * 1.02);
      car.tireWearRL = Math.min(1, car.tireWearRL + wearRate * 0.95);
      car.tireWearRR = Math.min(1, car.tireWearRR + wearRate * 0.97);
      car.tireWear = Math.max(car.tireWearFL, car.tireWearFR, car.tireWearRL, car.tireWearRR);

      const maxStintSec = 2.5 * 3600;
      car.driverStamina = Math.max(0, 100 - (car.stintTimeSec / maxStintSec) * 100);

      if (car.fuel <= 0 && car.speed * deltaTime < 0.5) {
        car.retired = true;
        car.retireReason = "Out of fuel";
        this.pendingEvents.push({
          type: "Retirement",
          entryId: car.entryId,
          lap: car.lap,
          timestamp: this.raceTime,
          message: `${car.teamName} retired: Out of fuel`,
        });
        continue;
      }

      car.distance += car.speed * deltaTime;

      const lapComplete = car.distance >= this.lapLength;
      if (lapComplete && car.pitQueued) {
        beginPitStop(car, this.lapLength);
        car.distance = Math.max(0, car.distance - this.lapLength);
        this.pendingEvents.push({
          type: "PitEnter",
          entryId: car.entryId,
          lap: car.lap,
          timestamp: this.raceTime,
          message: `${car.teamName} entered pit lane`,
        });
        continue;
      }

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

      const throttleLoad =
        car.driverMode === "push" ? 1.05 : car.driverMode === "conserve" ? 0.9 : 1.0;
      const baseSpeed = CLASS_SPEED[car.classId] ?? 85;
      const grip = tyreGripScale(
        car.tyreTread,
        this.weather.trackWetness,
        this.weather.ambientTempC,
      );
      car.speed = baseSpeed * throttleLoad * Math.max(0.15, grip);

      if (car.hybridBudgetMJ > 0) {
        const deployScale =
          car.hybridStrategy === "deploy"
            ? 1.0
            : car.hybridStrategy === "harvest"
              ? 0.22
              : car.hybridStrategy === "hold"
                ? 0.0
                : 0.78;
        const regenScale =
          car.hybridStrategy === "deploy"
            ? 0.92
            : car.hybridStrategy === "harvest"
              ? 1.4
              : car.hybridStrategy === "hold"
                ? 1.12
                : 1.0;
        const speedKmh = car.speed * 3.6;
        if (speedKmh >= 120 && deployScale > 0) {
          car.hybridDeployMJ = Math.max(
            0,
            car.hybridDeployMJ - 0.00018 * deployScale * throttleLoad * deltaTime,
          );
        } else if (speedKmh > 80) {
          car.hybridDeployMJ = Math.min(
            car.hybridBudgetMJ,
            car.hybridDeployMJ + 0.00012 * regenScale * deltaTime,
          );
        }
      }

      const heatIn = (0.22 + car.speed / 320) * throttleLoad;
      const coolOut = 0.14 + car.speed / 110;
      car.coolantTempC += (heatIn - coolOut) * deltaTime;
      car.coolantTempC = Math.max(70, Math.min(112, car.coolantTempC));
      if (car.coolantTempC > 105) {
        car.engineHealth = Math.max(
          0,
          car.engineHealth - (car.coolantTempC - 105) * 0.006 * deltaTime,
        );
      }
      if (car.engineHealth <= 0) {
        car.retired = true;
        car.retireReason = "Engine failure";
        this.pendingEvents.push({
          type: "Retirement",
          entryId: car.entryId,
          lap: car.lap,
          timestamp: this.raceTime,
          message: `${car.teamName} retired: Engine failure`,
        });
      }
    }
    if (this.checkRaceComplete()) {
      this.raceComplete = true;
      this.pendingEvents.push({
        type: "RaceComplete",
        timestamp: this.raceTime,
        message: "Race complete",
      });
    }
  }

  private checkRaceComplete(): boolean {
    if (!this.raceConfig) return false;
    if (
      this.raceConfig.targetDurationSeconds > 0 &&
      this.raceTime >= this.raceConfig.targetDurationSeconds
    ) {
      return true;
    }
    if (this.raceConfig.targetLaps <= 0) return false;
    let anyRacing = false;
    for (const car of this.cars) {
      if (car.retired) continue;
      anyRacing = true;
      if (car.lap > this.raceConfig.targetLaps) return true;
    }
    return !anyRacing && this.cars.length > 0;
  }

  getSnapshots(): CarSnapshot[] {
    const timingMode = isOpenSessionMode(this.raceConfig?.sessionMode ?? "race");
    const board = sortCarsForBoard(this.cars, timingMode);
    const classLeaders: Record<string, CarState> = {};
    const classRank: Record<string, number> = {};
    return board.map((car, rank) => {
      if (timingMode && !classLeaders[car.classId]) {
        classLeaders[car.classId] = car;
      }
      const classLeader = classLeaders[car.classId];
      const d = car.inPit
        ? car.pitLaneDistance
        : car.distance;
      const sample = car.inPit
        ? (this.samples.find((s) => s.distance >= d) ?? this.samples[0])
        : poseAtRaceDistance(d, this.samples);
      const lateralOffset = car.inPit ? PIT_LATERAL_OFFSET_M : 0;
      const perpX = -sample.tangentZ;
      const perpZ = sample.tangentX;
      classRank[car.classId] = (classRank[car.classId] ?? 0) + 1;
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
        tireWearFL: car.tireWearFL,
        tireWearFR: car.tireWearFR,
        tireWearRL: car.tireWearRL,
        tireWearRR: car.tireWearRR,
        tireCompound: tyreCompoundId(car.startingCompound ?? "medium", car.tyreTread),
        tireTempC: car.tireTempC,
        coolantTempC: car.coolantTempC,
        hybridDeployMJ: car.hybridBudgetMJ > 0 ? car.hybridDeployMJ : undefined,
        hybridBudgetMJ: car.hybridBudgetMJ > 0 ? car.hybridBudgetMJ : undefined,
        hybridStrategy: car.hybridBudgetMJ > 0 ? car.hybridStrategy : undefined,
        engineHealth: car.engineHealth,
        partHealth: Object.keys(car.partHealth).length ? car.partHealth : undefined,
        tyreDeflation: Object.keys(car.tyreDeflation).length ? car.tyreDeflation : undefined,
        limpMode: car.limpMode !== "none" ? car.limpMode : undefined,
        structuralSeverity: undefined,
        sectorIndex: car.sectorIndex,
        racePosition: rank + 1,
        classPosition: classRank[car.classId],
        inGarage: car.inGarage,
        inPit: car.inPit,
        pitQueued: car.pitQueued,
        pitRemainingSec: car.inPit ? car.pitRemainingSec : 0,
        pitLaneDistance: car.inPit ? car.pitLaneDistance : undefined,
        driverName: car.driverRoster[car.activeDriverIndex]?.name ?? car.teamName,
        driverStamina: car.driverStamina,
        activeDriverIndex: car.activeDriverIndex,
        driverRoster: car.driverRoster.map((d, i) => ({
          name: d.name,
          tier: "Silver",
          nationality: "—",
          dryPace: 75,
          wetPace: 70,
          consistency: 75,
          overtaking: 72,
          defending: 72,
          setupFeedback: 70,
          stamina: 78,
          composure: 75,
          active: i === car.activeDriverIndex,
        })),
        retired: car.retired,
        retireReason: car.retireReason || undefined,
        currentLapTime: car.currentLapTime,
        currentSectorTime: car.currentSectorTime,
        lastLapTime: car.lastLapTime,
        bestLapTime: car.bestLapTime,
        gapToLeader: timingMode
          ? classLeader
            ? computeTimingGap(car, classLeader)
            : 0
          : board[0]
            ? computeGapToLeader(car, board[0], this.lapLength)
            : 0,
        currentLapSectorTimes: [...car.currentLapSectorTimes],
        lapHistory: car.lapHistory.map((lap) => ({
          lapNumber: lap.lapNumber,
          lapTime: lap.lapTime,
          sectorTimes: [...lap.sectorTimes],
        })),
        position: {
          x: sample.x + perpX * lateralOffset,
          y: 0,
          z: sample.z + perpZ * lateralOffset,
        },
        tangent: { x: sample.tangentX, y: 0, z: sample.tangentZ },
        pitCount: car.pitCount,
        totalPitSeconds: car.totalPitSeconds,
        fuelTankCapacity: car.fuelTankCapacity,
        driverStintSeconds: car.stintTimeSec,
        maxDriverStintSeconds: car.maxDriverStintSeconds,
        driverMode: car.driverMode,
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
      : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: "1", classId: "solo" }];

    const previousByEntry = new Map(
      this.cars.map((car) => [car.entryId, car] as const),
    );
    this.cars = entries.map((e) => {
      const car = makeCarState(e);
      const prev = previousByEntry.get(e.entryId);
      if (prev?.driverRoster?.length) {
        car.driverRoster = prev.driverRoster.map((d) => ({ ...d }));
        car.activeDriverIndex = 0;
        car.driverStamina = 100;
        car.driverMode = "normal";
        car.stintTimeSec = 0;
      }
      return car;
    });
    if (isOpenSessionMode(this.raceConfig.sessionMode)) {
      for (const car of this.cars) {
        placeCarInGarage(car, this.lapLength);
      }
    }
    for (const car of this.cars) {
      car.sectorIndex = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
    }
    this.raceTime = 0;
    this.pendingEvents = [];
    this.raceComplete = false;
    this.resetWeather();
    return true;
  }

  getRaceControl(): RaceControlPayload {
    const profile = this.weatherProfileData;
    const forecast = buildWeatherForecast(this.weather, profile, this.raceTime);
    return {
      fcyActive: false,
      scActive: false,
      trackWetness: this.weather.trackWetness,
      ambientTempC: this.weather.ambientTempC,
      trackGripEvolution: this.weather.trackGripEvolution,
      rainIntensity: this.weather.rainIntensity,
      weatherPhase: this.weather.phase,
      forecastRainInSeconds: this.weather.forecastRainInSeconds,
      forecast,
      weatherLabel: this.weatherLabel || undefined,
      weatherBiome: this.weatherBiome || undefined,
    };
  }

  isRaceComplete(): boolean {
    return this.raceComplete;
  }

  getRaceTime(): number {
    return this.raceTime;
  }
}
