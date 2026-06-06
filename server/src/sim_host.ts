import * as path from "path";
import * as fs from "fs";
import { normalizeEvent, normalizeTrackGeometry } from "./adapters";
import {
  loadMapLabels,
  loadTrackName,
  parseEntries,
  parseRaceConfig,
  type ParsedEntry,
} from "./config_parser";
import { MockSimSession } from "./mock_session";
import { AiStrategyManager } from "./game/ai_strategy";
import type {
  CarSnapshot,
  RaceControlPayload,
  SessionInitPayload,
  SimEvent,
  TrackGeometryPayload,
  WeekendSessionType,
} from "./ws_protocol";

export interface SimSessionLike {
  initFromRaceConfig(configPath: string): boolean;
  reloadDefinitions?(): boolean;
  restartRace?(): boolean;
  tick(deltaTime: number): void;
  getSnapshots(): CarSnapshot[];
  drainEvents(): SimEvent[] | Array<{ type: string; entryId?: string; lap?: number; sectorIndex?: number; timestamp: number; message: string }>;
  getTrackGeometry(): TrackGeometryPayload | { name: string; lapLength: number; points: Array<{ x: number; z: number }>; sectors: Array<{ name: string; startT: number; endT: number }> };
  isRaceComplete(): boolean;
  getRaceTime?(): number;
  submitCommand?(entryId: string, command: string): boolean;
  getRaceControl?(): {
    fcyActive: boolean;
    scActive: boolean;
    trackWetness: number;
    ambientTempC: number;
    trackGripEvolution: number;
    rainIntensity?: number;
    weatherPhase?: string;
    forecastRainInSeconds?: number;
  };
  getReplayLog?(): Array<{ timestamp: number; entryId: string; command: string }>;
  getRngSeed?(): number;
}

export interface SimHostOptions {
  raceConfigPath?: string;
  repoRoot?: string;
}

const DEFAULT_RACE_CONFIG = "configs/race_config_web.txt";

function resolveRepoRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.PROJECTLM_ROOT) return path.resolve(process.env.PROJECTLM_ROOT);
  return path.resolve(__dirname, "..", "..");
}

function loadSession(repoRoot: string): { session: SimSessionLike; source: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require("@projectlm/native") as SimSessionLike;
    return { session: native, source: "native (@projectlm/native)" };
  } catch (err) {
    console.warn(
      "[sim_host] Native binding unavailable, using mock:",
      (err as Error).message,
    );
    return { session: new MockSimSession(repoRoot), source: "mock fallback" };
  }
}

export class SimHost {
  readonly repoRoot: string;
  raceConfigPath: string;
  readonly session: SimSessionLike;
  readonly bindingSource: string;

  private parsedConfig;
  private entries: ParsedEntry[];
  private trackName: string;
  private simTimestep: number;
  private sessionType: WeekendSessionType | "demo" = "demo";
  private eventName = "";
  private targetDurationMinutes = 0;
  private raceTime = 0;
  private timeScale = 1;
  private paused = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private onTick?: (
    raceTime: number,
    snapshots: CarSnapshot[],
    raceControl?: RaceControlPayload,
  ) => void;
  private onEvents?: (events: SimEvent[]) => void;
  private onRaceComplete?: (
    raceTime: number,
    results: Array<{
      entryId: string;
      teamName: string;
      carNumber: number;
      classId: string;
      position: number;
    }>,
  ) => void;
  private ai = new AiStrategyManager();
  private playerEntryId = "";

  constructor(options: SimHostOptions = {}) {
    this.repoRoot = resolveRepoRoot(options.repoRoot);
    const rel = options.raceConfigPath ?? DEFAULT_RACE_CONFIG;
    this.raceConfigPath = path.isAbsolute(rel)
      ? rel
      : path.join(this.repoRoot, rel);

    const loaded = loadSession(this.repoRoot);
    this.bindingSource = loaded.source;
    this.session = loaded.session;

    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    const configForSim = path.isAbsolute(rel)
      ? path.relative(this.repoRoot, this.raceConfigPath)
      : rel;

    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const initOk = this.session.initFromRaceConfig(configForSim);
    process.chdir(prevCwd);

    if (!initOk) {
      throw new Error(`Failed to init sim from ${this.raceConfigPath}`);
    }
    this.simTimestep = this.parsedConfig.simTimestep;
    this.trackName = loadTrackName(this.repoRoot, this.parsedConfig.trackConfigPath);

    if (this.parsedConfig.entriesPath) {
      this.entries = parseEntries(this.repoRoot, this.parsedConfig.entriesPath);
    } else {
      this.entries = [
        { entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" },
      ];
    }

    console.log(
      `[sim_host] ${this.bindingSource} — ${this.trackName} (${this.entries.length} entries, timestep ${this.simTimestep}s)`,
    );
  }

  getSessionInit() {
    return {
      trackName: this.trackName,
      targetLaps: this.parsedConfig.targetLaps,
      targetDurationMinutes: this.targetDurationMinutes,
      sessionType: this.sessionType as SessionInitPayload["sessionType"],
      eventName: this.eventName,
      simTimestep: this.simTimestep,
      entries: this.entries,
      carNumberByEntryId: Object.fromEntries(
        this.entries.map((entry) => [entry.entryId, entry.carNumber]),
      ),
    };
  }

  setPlayerEntryId(entryId: string): void {
    this.playerEntryId = entryId;
  }

  startRound(
    raceConfigRelPath: string,
    options: {
      sessionType: WeekendSessionType | "demo";
      eventName: string;
      targetDurationMinutes: number;
      startPaused?: boolean;
    },
  ): boolean {
    const abs = path.isAbsolute(raceConfigRelPath)
      ? raceConfigRelPath
      : path.join(this.repoRoot, raceConfigRelPath);
    this.raceConfigPath = abs;

    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const configForSim = path.isAbsolute(raceConfigRelPath)
      ? path.relative(this.repoRoot, abs)
      : raceConfigRelPath;
    const ok = this.session.initFromRaceConfig(configForSim);
    process.chdir(prevCwd);

    if (!ok) return false;

    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    this.simTimestep = this.parsedConfig.simTimestep;
    this.trackName = loadTrackName(this.repoRoot, this.parsedConfig.trackConfigPath);
    this.sessionType = options.sessionType;
    this.eventName = options.eventName;
    this.targetDurationMinutes = options.targetDurationMinutes;

    if (this.parsedConfig.entriesPath) {
      this.entries = parseEntries(this.repoRoot, this.parsedConfig.entriesPath);
    }

    this.raceTime = 0;
    this.paused = options.startPaused ?? true;
    if (this.timeScale === 0) this.timeScale = 1;
    this.restartTickLoop();
    return true;
  }

  getRaceTime(): number {
    return this.session.getRaceTime?.() ?? this.raceTime;
  }

  getSnapshots(): CarSnapshot[] {
    return this.enrichSnapshots(this.session.getSnapshots());
  }

  getTrackGeometry(): TrackGeometryPayload {
    const raw = this.session.getTrackGeometry();
    const geometry =
      "polyline" in raw ? raw : normalizeTrackGeometry(raw);
    const mapLabels = loadMapLabels(
      this.repoRoot,
      this.parsedConfig.trackConfigPath,
    );
    if (mapLabels.length === 0) return geometry;
    return { ...geometry, mapLabels };
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
    if (this.timeScale === 0) this.paused = true;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    if (this.timeScale === 0) this.timeScale = 1;
  }

  start(
    onTick: (raceTime: number, snapshots: CarSnapshot[], raceControl?: RaceControlPayload) => void,
    onEvents: (events: SimEvent[]) => void,
    onRaceComplete: SimHost["onRaceComplete"],
  ): void {
    this.onTick = onTick;
    this.onEvents = onEvents;
    this.onRaceComplete = onRaceComplete;

    const intervalMs = Math.max(16, this.simTimestep * 1000);
    this.tickTimer = setInterval(() => this.step(), intervalMs);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  restartRace(): boolean {
    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const ok =
      this.session.restartRace?.() ??
      this.session.initFromRaceConfig(this.configPathForSim());
    process.chdir(prevCwd);

    if (!ok) return false;

    this.raceTime = 0;
    this.paused = false;
    if (this.timeScale === 0) this.timeScale = 1;
    this.ensureTickLoop();
    return true;
  }

  reloadDefinitions(): boolean {
    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const ok =
      this.session.reloadDefinitions?.() ??
      this.session.initFromRaceConfig(this.configPathForSim());
    process.chdir(prevCwd);

    if (!ok) return false;

    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    this.simTimestep = this.parsedConfig.simTimestep;
    this.trackName = loadTrackName(
      this.repoRoot,
      this.parsedConfig.trackConfigPath,
    );
    if (this.parsedConfig.entriesPath) {
      this.entries = parseEntries(this.repoRoot, this.parsedConfig.entriesPath);
    } else {
      this.entries = [
        { entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" },
      ];
    }

    this.raceTime = 0;
    this.paused = false;
    if (this.timeScale === 0) this.timeScale = 1;
    this.restartTickLoop();
    return true;
  }

  private enrichSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
    const numbersByEntryId = new Map(
      this.entries.map((entry) => [entry.entryId, entry.carNumber]),
    );
    const numbersByTeamName = new Map(
      this.entries.map((entry) => [entry.teamName, entry.carNumber]),
    );
    return snapshots.map((snap) => {
      const fromEntry =
        numbersByEntryId.get(snap.entryId) ??
        numbersByTeamName.get(snap.teamName) ??
        0;
      const carNumber =
        fromEntry > 0
          ? fromEntry
          : Number(snap.carNumber) > 0
            ? Number(snap.carNumber)
            : 0;
      return { ...snap, carNumber };
    });
  }

  getRaceControl(): RaceControlPayload | undefined {
    return this.session.getRaceControl?.();
  }

  saveReplayLog(): void {
    const replay = this.session.getReplayLog?.();
    if (!replay || replay.length === 0) return;
    const outPath = path.join(this.repoRoot, "data", "last_replay.json");
    const payload = {
      rngSeed: this.session.getRngSeed?.() ?? 0,
      raceConfigPath: this.configPathForSim(),
      commands: replay,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  }

  private configPathForSim(): string {
    const rel = path.relative(this.repoRoot, this.raceConfigPath);
    return rel.startsWith("..") ? this.raceConfigPath : rel;
  }

  private ensureTickLoop(): void {
    if (this.tickTimer || !this.onTick) return;
    const intervalMs = Math.max(16, this.simTimestep * 1000);
    this.tickTimer = setInterval(() => this.step(), intervalMs);
  }

  private restartTickLoop(): void {
    this.stop();
    this.ensureTickLoop();
  }

  private step(): void {
    if (this.paused || this.timeScale === 0) return;
    if (this.session.isRaceComplete()) return;

    const frameDelta = this.simTimestep * this.timeScale;
    let remaining = frameDelta;
    while (remaining > 1e-9) {
      const dt = Math.min(this.simTimestep, remaining);
      this.session.tick(dt);
      remaining -= dt;
    }
    this.raceTime += frameDelta;

    const snapshots = this.enrichSnapshots(this.session.getSnapshots());
    const raceTime = this.session.getRaceTime?.() ?? this.raceTime;
    const raceControl = this.session.getRaceControl?.();

    if (this.session.submitCommand) {
      const submit = this.session.submitCommand.bind(this.session);
      this.ai.setContext({
        raceTime,
        targetDurationSeconds: this.targetDurationMinutes * 60,
        fcyActive: raceControl?.fcyActive,
        scActive: raceControl?.scActive,
        trackWetness: raceControl?.trackWetness,
        weatherPhase: raceControl?.weatherPhase,
        rainIntensity: raceControl?.rainIntensity,
      });
      this.ai.tick(snapshots, this.playerEntryId, (entryId, command) =>
        submit(entryId, command),
      );
    }

    this.onTick?.(raceTime, snapshots, raceControl);

    const rawEvents = this.session.drainEvents();
    const events: SimEvent[] = rawEvents.map((e) =>
      typeof e.type === "string" && e.type.includes("_")
        ? normalizeEvent(e)
        : (e as SimEvent),
    );

    if (events.length > 0) {
      this.onEvents?.(events);
      if (events.some((e) => e.type === "RaceComplete")) {
        this.saveReplayLog();
        this.onRaceComplete?.(
          raceTime,
          snapshots.map((s) => ({
            entryId: s.entryId,
            teamName: s.teamName,
            carNumber: s.carNumber,
            classId: s.classId,
            position: s.racePosition,
          })),
        );
        this.stop();
      }
    }
  }
}
