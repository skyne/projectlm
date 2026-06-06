import * as path from "path";
import { normalizeEvent, normalizeTrackGeometry } from "./adapters";
import { MetaStateManager } from "./meta_state";
import { buildRaceForRound } from "./game/race_builder";
import { loadTrackGeometryById } from "./game/track_loader";
import { loadGameCatalog } from "./game/catalog";
import { playerCarPath } from "./game/car_builder";
import {
  loadMapLabels,
  loadTrackName,
  parseEntries,
  parseRaceConfig,
  type ParsedEntry,
} from "./config_parser";
import { AiStrategyManager } from "./game/ai_strategy";
import { AiStintGuide } from "./llm/ai_stint_guide";
import { MockSimSession } from "./mock_session";
import type { CarBuildPayload, CarSnapshot, CreateTeamPayload, MetaStatePayload, RaceControlPayload, SimEvent, TeamCreationDraftPayload, TrackGeometryPayload } from "./ws_protocol";

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
  getRaceControl?(): RaceControlPayload;
  submitCommand?(entryId: string, command: string): boolean;
}

export interface SimHostOptions {
  raceConfigPath?: string;
  repoRoot?: string;
}

export interface SessionInitExtra {
  targetDurationSeconds: number;
  raceFormat: string;
  roundNumber: number;
  weatherContext?: {
    trackId: string;
    month: number;
    monthName: string;
    biome: string;
    label: string;
    rainWeight: number;
  };
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
  private entries: ParsedEntry[] = [];
  private trackName = "Unknown";
  private simTimestep = 0.1;
  private raceTime = 0;
  private timeScale = 1;
  private paused = true;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private sessionExtra: SessionInitExtra = {
    targetDurationSeconds: 0,
    raceFormat: "",
    roundNumber: 0,
  };
  private runtimePlayerEntryId = "entry-1";
  private activeRoundNumber = 0;
  private readonly aiStrategy = new AiStrategyManager();
  private readonly aiStintGuide = new AiStintGuide();

  private onTick?: (raceTime: number, snapshots: CarSnapshot[]) => void;
  private onEvents?: (events: SimEvent[]) => void;
  private onRaceComplete?: (
    raceTime: number,
    results: Array<{
      entryId: string;
      teamName: string;
      carNumber: string;
      classId: string;
      position: number;
    }>,
  ) => void;

  readonly meta: MetaStateManager;

  constructor(options: SimHostOptions = {}) {
    this.repoRoot = resolveRepoRoot(options.repoRoot);
    this.meta = new MetaStateManager(this.repoRoot);
    const rel = options.raceConfigPath ?? DEFAULT_RACE_CONFIG;
    this.raceConfigPath = path.isAbsolute(rel)
      ? rel
      : path.join(this.repoRoot, rel);

    const loaded = loadSession(this.repoRoot);
    this.bindingSource = loaded.source;
    this.session = loaded.session;

    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    this.initSimFromCurrentConfig();

    console.log(
      `[sim_host] ${this.bindingSource} — ${this.trackName} (${this.entries.length} entries, paused until start_round)`,
    );
  }

  private initSimFromCurrentConfig(): boolean {
    const configForSim = this.configPathForSim();
    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const initOk = this.session.initFromRaceConfig(configForSim);
    process.chdir(prevCwd);

    if (!initOk) return false;

    this.simTimestep = this.parsedConfig.simTimestep;
    this.trackName = loadTrackName(this.repoRoot, this.parsedConfig.trackConfigPath);
    this.refreshEntriesFromConfig();
    this.raceTime = 0;
    this.aiStrategy.reset();
    this.aiStintGuide.reset();
    return true;
  }

  private refreshEntriesFromConfig(): void {
    if (this.parsedConfig.entriesPath) {
      this.entries = parseEntries(this.repoRoot, this.parsedConfig.entriesPath);
    } else {
      this.entries = [
        { entryId: "solo-1", teamName: "Solo Entry", carNumber: "1", classId: "solo" },
      ];
    }
  }

  getSessionInit() {
    const meta = this.getMetaState();
    const round = meta.calendar.find((e) => e.round === meta.currentRound);
    return {
      trackName: this.trackName,
      targetLaps: this.parsedConfig.targetLaps,
      targetDurationSeconds: this.sessionExtra.targetDurationSeconds,
      raceFormat: this.sessionExtra.raceFormat || round?.format || "",
      roundNumber: this.sessionExtra.roundNumber || meta.currentRound,
      simTimestep: this.simTimestep,
      entries: this.entries,
      carNumberByEntryId: Object.fromEntries(
        this.entries.map((entry) => [entry.entryId, entry.carNumber]),
      ),
      playerEntryId: this.runtimePlayerEntryId,
      paused: this.paused,
      weatherContext: this.sessionExtra.weatherContext,
    };
  }

  /** Meta/season lives entirely in server TS — sim only receives staff for pit modifiers. */
  getMetaState(): MetaStatePayload {
    return this.meta.getState();
  }

  startRound(): string | null {
    const built = buildRaceForRound(this.repoRoot, this.meta.getState());
    if (!built) {
      console.warn("[sim_host] No calendar event for current round");
      return "No calendar event for the current round";
    }

    this.raceConfigPath = path.join(this.repoRoot, built.raceConfigPath);
    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    this.sessionExtra = {
      targetDurationSeconds: built.targetDurationSeconds,
      raceFormat: built.raceFormat,
      roundNumber: built.roundNumber,
      weatherContext: built.weatherContext,
    };
    this.trackName = built.trackName;

    if (!this.initSimFromCurrentConfig()) {
      return "Failed to load race — check car builds in the Garage";
    }

    this.entries = built.entries.map((e) => ({
      entryId: e.entryId,
      teamName: e.teamName,
      carNumber: e.carNumber,
      classId: e.classId,
    }));

    this.runtimePlayerEntryId = built.playerEntryId;
    this.activeRoundNumber = built.roundNumber;
    this.meta.clearLastCompletedRound();
    this.aiStrategy.reset();
    this.aiStintGuide.reset();

    this.paused = true;
    if (this.timeScale === 0) this.timeScale = 1;
    this.ensureTickLoop();
    console.log(
      `[sim_host] Round ${built.roundNumber} — ${built.trackName} ${built.raceFormat} (${this.entries.length} cars, paused until resume)`,
    );
    return null;
  }

  submitCommand(entryId: string, command: string): string | null {
    if (!this.session.submitCommand) return "submitCommand unavailable";
    if (entryId !== this.runtimePlayerEntryId) {
      return "You can only send commands to your car";
    }
    this.session.submitCommand(entryId, command);
    return null;
  }

  hireStaff(role: string, name: string, skill: number): MetaStatePayload {
    return this.meta.hireStaff(role, name, skill);
  }

  investRd(partId: string, points: number): MetaStatePayload {
    return this.meta.investRd(partId, points);
  }

  completeRound(position: number, classId: string): MetaStatePayload {
    return this.meta.completeRound(position, classId);
  }

  signSponsor(offerId: string): MetaStatePayload | { error: string } {
    return this.meta.signSponsor(offerId);
  }

  dropSponsor(offerId: string): MetaStatePayload | { error: string } {
    return this.meta.dropSponsor(offerId);
  }

  createTeam(payload: CreateTeamPayload): MetaStatePayload | null {
    return this.meta.createTeam(payload);
  }

  saveTeamCreationDraft(
    draft: TeamCreationDraftPayload,
  ): MetaStatePayload | { error: string } {
    return this.meta.saveTeamCreationDraft(draft);
  }

  saveCarBuild(
    build: CarBuildPayload,
  ): MetaStatePayload | { error: string } {
    return this.meta.saveCarBuild(build);
  }

  buyCar(payload: import("./ws_protocol").BuyCarPayload): MetaStatePayload | { error: string } {
    return this.meta.buyCar(payload);
  }

  setActiveCar(carId: string): MetaStatePayload | null {
    return this.meta.setActiveCar(carId);
  }

  setPlayerEntry(carId: string): MetaStatePayload | null {
    return this.meta.setPlayerEntry(carId);
  }

  removeCar(carId: string): MetaStatePayload | { error: string } {
    return this.meta.removeCar(carId);
  }

  saveDriverRoster(
    roster: import("./ws_protocol").DriverProfilePayload[],
    assignments?: Record<string, number[]>,
  ): MetaStatePayload | { error: string } {
    return this.meta.saveDriverRoster(roster, assignments);
  }

  refreshDriverMarket(): MetaStatePayload | { error: string } {
    return this.meta.refreshDriverMarket();
  }

  signDriverContract(listingId: string): MetaStatePayload | { error: string } {
    return this.meta.signDriverContract(listingId);
  }

  saveTeamColors(
    colors: { primary: string; secondary: string },
  ): MetaStatePayload | null {
    return this.meta.saveTeamColors(colors);
  }

  setWeekendTireCompound(
    compound: string,
  ): MetaStatePayload | { error: string } {
    return this.meta.setWeekendTireCompound(compound);
  }

  validateFleetForRace(): string | null {
    return this.meta.validateFleetForRace();
  }

  newGame(): MetaStatePayload {
    const meta = this.meta.resetNewGame();
    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    this.session.initFromRaceConfig(this.configPathForSim());
    process.chdir(prevCwd);

    this.parsedConfig = parseRaceConfig(this.repoRoot, this.raceConfigPath);
    this.refreshEntriesFromConfig();
    this.raceTime = 0;
    this.aiStrategy.reset();
    this.aiStintGuide.reset();
    this.paused = true;
    if (this.timeScale === 0) this.timeScale = 1;
    this.restartTickLoop();
    return meta;
  }

  getGameCatalog() {
    return loadGameCatalog(this.repoRoot);
  }

  getRaceTime(): number {
    return this.session.getRaceTime?.() ?? this.raceTime;
  }

  getSnapshots(): CarSnapshot[] {
    return this.enrichSnapshots(this.session.getSnapshots());
  }

  getRaceControl(): RaceControlPayload | undefined {
    return this.session.getRaceControl?.();
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

  getTrackPreview(trackId: string): TrackGeometryPayload | null {
    return loadTrackGeometryById(this.repoRoot, trackId);
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
    onTick: (raceTime: number, snapshots: CarSnapshot[]) => void,
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
    this.meta.reopenRound(this.activeRoundNumber);

    const prevCwd = process.cwd();
    process.chdir(this.repoRoot);
    const ok =
      this.session.restartRace?.() ??
      this.session.initFromRaceConfig(this.configPathForSim());
    process.chdir(prevCwd);

    if (!ok) return false;

    this.raceTime = 0;
    this.aiStrategy.reset();
    this.aiStintGuide.reset();
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
    this.refreshEntriesFromConfig();

    this.raceTime = 0;
    this.aiStrategy.reset();
    this.aiStintGuide.reset();
    this.paused = true;
    if (this.timeScale === 0) this.timeScale = 1;
    this.meta.reload();
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
        "";
      const carNumber =
        fromEntry ||
        (typeof snap.carNumber === "string" && snap.carNumber ? snap.carNumber : "");
      return carNumber ? { ...snap, carNumber } : snap;
    });
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

  private runAiStrategy(): void {
    if (!this.session.submitCommand) return;
    const snapshots = this.session.getSnapshots();
    const ctx = {
      raceTime: this.getRaceTime(),
      targetDurationSeconds: this.sessionExtra.targetDurationSeconds,
    };
    this.aiStintGuide.observe(snapshots, this.runtimePlayerEntryId, {
      trackName: this.trackName,
      targetDurationSeconds: ctx.targetDurationSeconds,
      raceTimeSec: ctx.raceTime,
    });
    this.aiStrategy.tick(
      snapshots,
      this.runtimePlayerEntryId,
      ctx,
      (entryId, command) => this.session.submitCommand!(entryId, command),
      (entryId) => this.aiStintGuide.getPlan(entryId),
    );
  }

  private step(): void {
    if (this.paused || this.timeScale === 0) return;
    if (this.session.isRaceComplete()) return;

    // Always integrate physics at sim_timestep — large steps overheat engines and
    // spike vibration damage when time compression multiplies delta in one tick.
    const frameDelta = this.simTimestep * this.timeScale;
    let remaining = frameDelta;
    while (remaining > 1e-9) {
      const dt = Math.min(this.simTimestep, remaining);
      this.session.tick(dt);
      remaining -= dt;
    }
    this.raceTime += frameDelta;

    this.runAiStrategy();

    const snapshots = this.enrichSnapshots(this.session.getSnapshots());
    const raceTime = this.getRaceTime();

    const rawEvents = this.session.drainEvents();
    const events: SimEvent[] = rawEvents.map((e) =>
      typeof e.type === "string" && e.type.includes("_")
        ? normalizeEvent(e)
        : (e as SimEvent),
    );

    if (events.length > 0) {
      this.onEvents?.(events);
      if (events.some((e) => e.type === "RaceComplete")) {
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
        this.paused = true;
      }
    }

    this.onTick?.(raceTime, snapshots);
  }
}
