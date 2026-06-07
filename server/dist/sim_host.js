"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimHost = void 0;
const path = __importStar(require("path"));
const adapters_1 = require("./adapters");
const meta_state_1 = require("./meta_state");
const race_builder_1 = require("./game/race_builder");
const track_loader_1 = require("./game/track_loader");
const catalog_1 = require("./game/catalog");
const config_parser_1 = require("./config_parser");
const pitbot_manager_1 = require("./game/pitbot/pitbot_manager");
const ai_stint_guide_1 = require("./llm/ai_stint_guide");
const ai_rival_season_1 = require("./game/ai_rival_season");
const mock_session_1 = require("./mock_session");
const weekend_sessions_1 = require("./game/weekend_sessions");
const DEFAULT_RACE_CONFIG = "configs/race_config_web.txt";
function resolveRepoRoot(explicit) {
    if (explicit)
        return path.resolve(explicit);
    if (process.env.PROJECTLM_ROOT)
        return path.resolve(process.env.PROJECTLM_ROOT);
    return path.resolve(__dirname, "..", "..");
}
function loadSession(repoRoot) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const native = require("@projectlm/native");
        return { session: native, source: "native (@projectlm/native)" };
    }
    catch (err) {
        console.warn("[sim_host] Native binding unavailable, using mock:", err.message);
        return { session: new mock_session_1.MockSimSession(repoRoot), source: "mock fallback" };
    }
}
class SimHost {
    constructor(options = {}) {
        this.entries = [];
        this.trackName = "Unknown";
        this.simTimestep = 0.1;
        this.raceTime = 0;
        this.timeScale = 1;
        this.paused = true;
        this.inRaceSession = false;
        this.sessionStartInProgress = false;
        this.tickTimer = null;
        this.sessionExtra = {
            targetDurationSeconds: 0,
            raceFormat: "",
            roundNumber: 0,
        };
        this.runtimePlayerEntryId = "entry-1";
        this.runtimeManagedEntryIds = ["entry-1"];
        this.activeRoundNumber = 0;
        this.fleetEntryMap = new Map();
        this.pitBot = new pitbot_manager_1.PitBotManager();
        this.stintGuide = new ai_stint_guide_1.AiStintGuide();
        this.lastRaceComplete = null;
        this.commandAttribution = new Map();
        this.repoRoot = resolveRepoRoot(options.repoRoot);
        this.meta = new meta_state_1.MetaStateManager(this.repoRoot);
        const rel = options.raceConfigPath ?? DEFAULT_RACE_CONFIG;
        this.raceConfigPath = path.isAbsolute(rel)
            ? rel
            : path.join(this.repoRoot, rel);
        const loaded = loadSession(this.repoRoot);
        this.bindingSource = loaded.source;
        this.session = loaded.session;
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.initSimFromCurrentConfig();
        console.log(`[sim_host] ${this.bindingSource} — ${this.trackName} (${this.entries.length} entries, paused until start_round)`);
    }
    initSimFromCurrentConfig() {
        const configForSim = this.configPathForSim();
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        const initOk = this.session.initFromRaceConfig(configForSim);
        process.chdir(prevCwd);
        if (!initOk)
            return false;
        this.simTimestep = this.parsedConfig.simTimestep;
        this.trackName = (0, config_parser_1.loadTrackName)(this.repoRoot, this.parsedConfig.trackConfigPath);
        this.refreshEntriesFromConfig();
        this.raceTime = 0;
        this.pitBot.reset();
        this.stintGuide.reset();
        return true;
    }
    refreshEntriesFromConfig() {
        if (this.parsedConfig.entriesPath) {
            this.entries = (0, config_parser_1.parseEntries)(this.repoRoot, this.parsedConfig.entriesPath);
        }
        else {
            this.entries = [
                { entryId: "solo-1", teamName: "Solo Entry", carNumber: "1", classId: "solo" },
            ];
        }
    }
    getLastRaceComplete() {
        return this.lastRaceComplete;
    }
    setLastRaceComplete(payload) {
        this.lastRaceComplete = payload;
    }
    getSessionInit() {
        const meta = this.getMetaState();
        const round = meta.calendar.find((e) => e.round === meta.currentRound);
        const init = {
            simBackend: this.bindingSource.includes("mock") ? "mock" : "native",
            trackName: this.trackName,
            targetLaps: this.parsedConfig.targetLaps,
            targetDurationSeconds: this.sessionExtra.targetDurationSeconds,
            raceFormat: this.sessionExtra.raceFormat || round?.format || "",
            roundNumber: this.sessionExtra.roundNumber || meta.currentRound,
            weekendSessionType: this.sessionExtra.weekendSessionType,
            simTimestep: this.simTimestep,
            entries: this.entries,
            carNumberByEntryId: Object.fromEntries(this.entries.map((entry) => [entry.entryId, entry.carNumber])),
            playerEntryId: this.runtimePlayerEntryId,
            managedEntryIds: this.runtimeManagedEntryIds,
            paused: this.paused,
            weatherContext: this.sessionExtra.weatherContext,
            raceActive: this.inRaceSession,
        };
        if (this.inRaceSession) {
            init.raceComplete = this.session.isRaceComplete();
            init.raceTime = this.getRaceTime();
            init.timeScale = this.timeScale;
        }
        return init;
    }
    /** Meta/season lives entirely in server TS — sim only receives staff for pit modifiers. */
    getMetaState() {
        return this.meta.getState();
    }
    /** Block starting a new weekend step while the current session is still on track. */
    sessionStartBlockedReason() {
        if (this.sessionStartInProgress) {
            return "Session start already in progress";
        }
        if (this.inRaceSession && !this.session.isRaceComplete()) {
            return "Current session still running — wait for session complete";
        }
        return null;
    }
    startRound(prep) {
        const blocked = this.sessionStartBlockedReason();
        if (blocked)
            return blocked;
        this.sessionStartInProgress = true;
        try {
            if (this.inRaceSession) {
                this.endSession();
            }
            return this.startRoundInner(prep);
        }
        finally {
            this.sessionStartInProgress = false;
        }
    }
    startRoundInner(prep) {
        const prepPayload = prep ?? {};
        const metaState = this.meta.getState();
        const round = metaState.calendar.find((e) => e.round === metaState.currentRound);
        if (!round) {
            return "No calendar event for the current round";
        }
        const sessionType = this.meta.resolveWeekendSession(prepPayload, round);
        const weekendErr = this.meta.validateWeekendSessionStart(sessionType);
        if (weekendErr)
            return weekendErr;
        if (prepPayload.trackId || prepPayload.carSetups?.length) {
            const prepErr = this.meta.applySessionPrep(prepPayload);
            if (prepErr)
                return prepErr;
        }
        const qualiResults = sessionType === "race"
            ? metaState.weekendProgress?.qualiResults
            : undefined;
        const built = (0, race_builder_1.buildRaceForRound)(this.repoRoot, this.meta.getState(), {
            sessionType,
            qualiResults,
        });
        if (!built) {
            console.warn("[sim_host] No calendar event for current round");
            return "No calendar event for the current round";
        }
        this.raceConfigPath = path.join(this.repoRoot, built.raceConfigPath);
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.sessionExtra = {
            targetDurationSeconds: built.targetDurationSeconds,
            raceFormat: built.raceFormat,
            roundNumber: built.roundNumber,
            weekendSessionType: built.sessionType,
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
            fleetCarId: e.fleetCarId,
        }));
        this.fleetEntryMap = new Map(built.entries
            .filter((e) => e.fleetCarId)
            .map((e) => [e.entryId, e.fleetCarId]));
        this.runtimeManagedEntryIds = built.managedEntryIds;
        this.runtimePlayerEntryId = built.playerEntryId;
        this.activeRoundNumber = built.roundNumber;
        this.meta.clearLastCompletedRound();
        this.pitBot.reset();
        this.stintGuide.reset();
        this.lastRaceComplete = null;
        this.inRaceSession = true;
        this.paused = true;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.ensureTickLoop();
        console.log(`[sim_host] Round ${built.roundNumber} — ${built.sessionLabel} @ ${built.trackName} (${this.entries.length} cars, paused until resume)`);
        return null;
    }
    getWeekendSessionType() {
        return this.sessionExtra.weekendSessionType ?? "race";
    }
    completeWeekendSession(sessionType, results) {
        const qualiResults = sessionType === "qualifying"
            ? (0, weekend_sessions_1.collectQualifyingResults)(results)
            : undefined;
        this.persistFleetCarConditions(sessionType);
        return this.meta.completeWeekendSession(sessionType, qualiResults);
    }
    persistFleetCarConditions(sessionType) {
        const snapshots = this.getSnapshots();
        if (!snapshots.length || this.fleetEntryMap.size === 0)
            return;
        this.meta.persistSessionCarConditions(snapshots, this.fleetEntryMap, sessionType);
    }
    repairCarCondition(carId, options) {
        return this.meta.repairCarCondition(carId, options);
    }
    getNextWeekendSessionAfter(sessionType) {
        return this.meta.getNextWeekendSessionAfter(sessionType);
    }
    submitCommand(entryId, command, attribution) {
        if (!this.session.submitCommand)
            return "submitCommand unavailable";
        if (!this.runtimeManagedEntryIds.includes(entryId)) {
            return "You can only send commands to your team's cars";
        }
        if (attribution) {
            this.commandAttribution.set(entryId, attribution);
        }
        this.session.submitCommand(entryId, command);
        return null;
    }
    applyCommandAttribution(events) {
        return events.map((event) => {
            if (event.type !== "CommandAck" || !event.entryId)
                return event;
            const attribution = this.commandAttribution.get(event.entryId);
            if (!attribution)
                return event;
            this.commandAttribution.delete(event.entryId);
            const base = event.message ?? "";
            return {
                ...event,
                message: `${attribution.displayName}: ${base}`,
            };
        });
    }
    hireStaff(role, name, skill) {
        return this.meta.hireStaff(role, name, skill);
    }
    investRd(partId, points) {
        return this.meta.investRd(partId, points);
    }
    completeRound(position, classId, raceResults) {
        this.persistFleetCarConditions("race");
        return this.meta.completeRound(position, classId, raceResults);
    }
    signSponsor(offerId) {
        return this.meta.signSponsor(offerId);
    }
    dropSponsor(offerId) {
        return this.meta.dropSponsor(offerId);
    }
    createTeam(payload) {
        return this.meta.createTeam(payload);
    }
    saveTeamCreationDraft(draft) {
        return this.meta.saveTeamCreationDraft(draft);
    }
    saveCarBuild(build, carId) {
        return this.meta.saveCarBuild(build, carId);
    }
    buyCar(payload) {
        return this.meta.buyCar(payload);
    }
    setActiveCar(carId) {
        return this.meta.setActiveCar(carId);
    }
    setPlayerEntry(carId) {
        return this.meta.setPlayerEntry(carId);
    }
    removeCar(carId) {
        return this.meta.removeCar(carId);
    }
    saveDriverRoster(roster, assignments) {
        return this.meta.saveDriverRoster(roster, assignments);
    }
    refreshDriverMarket() {
        return this.meta.refreshDriverMarket();
    }
    signDriverContract(listingId) {
        return this.meta.signDriverContract(listingId);
    }
    saveTeamColors(colors) {
        return this.meta.saveTeamColors(colors);
    }
    setWeekendTireCompound(compound) {
        return this.meta.setWeekendTireCompound(compound);
    }
    saveTrackSetupPreset(trackId, preset) {
        return this.meta.saveTrackSetupPreset(trackId, preset);
    }
    validateFleetForRace() {
        return this.meta.validateFleetForRace();
    }
    newGame() {
        const meta = this.meta.resetNewGame();
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        this.session.initFromRaceConfig(this.configPathForSim());
        process.chdir(prevCwd);
        this.inRaceSession = false;
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.refreshEntriesFromConfig();
        this.raceTime = 0;
        this.pitBot.reset();
        this.stintGuide.reset();
        this.paused = true;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.restartTickLoop();
        return meta;
    }
    getGameCatalog() {
        return (0, catalog_1.loadGameCatalog)(this.repoRoot);
    }
    getRaceTime() {
        return this.session.getRaceTime?.() ?? this.raceTime;
    }
    getTimeScale() {
        return this.timeScale;
    }
    getSnapshots() {
        return this.enrichSnapshots(this.session.getSnapshots());
    }
    getRaceControl() {
        return this.session.getRaceControl?.();
    }
    getTrackGeometry() {
        const raw = this.session.getTrackGeometry();
        const geometry = "polyline" in raw ? raw : (0, adapters_1.normalizeTrackGeometry)(raw);
        const mapLabels = (0, config_parser_1.loadMapLabels)(this.repoRoot, this.parsedConfig.trackConfigPath);
        if (mapLabels.length === 0)
            return geometry;
        return { ...geometry, mapLabels };
    }
    getTrackPreview(trackId) {
        return (0, track_loader_1.loadTrackGeometryById)(this.repoRoot, trackId);
    }
    setTimeScale(scale) {
        this.timeScale = Math.max(0, scale);
        if (this.timeScale === 0)
            this.paused = true;
    }
    pause() {
        this.paused = true;
    }
    resume() {
        this.paused = false;
        if (this.timeScale === 0)
            this.timeScale = 1;
    }
    start(onTick, onEvents, onRaceComplete) {
        this.onTick = onTick;
        this.onEvents = onEvents;
        this.onRaceComplete = onRaceComplete;
        const intervalMs = Math.max(16, this.simTimestep * 1000);
        this.tickTimer = setInterval(() => this.step(), intervalMs);
    }
    stop() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }
    endSession() {
        if (!this.inRaceSession)
            return true;
        this.inRaceSession = false;
        this.raceTime = 0;
        this.sessionExtra = {
            targetDurationSeconds: 0,
            raceFormat: "",
            roundNumber: 0,
            weekendSessionType: undefined,
        };
        this.pitBot.reset();
        this.stintGuide.reset();
        this.lastRaceComplete = null;
        this.paused = true;
        if (this.timeScale === 0)
            this.timeScale = 1;
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        const ok = this.session.initFromRaceConfig(this.configPathForSim());
        process.chdir(prevCwd);
        return ok;
    }
    restartRace() {
        this.meta.reopenRound(this.activeRoundNumber);
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        const ok = this.session.restartRace?.() ??
            this.session.initFromRaceConfig(this.configPathForSim());
        process.chdir(prevCwd);
        if (!ok)
            return false;
        this.raceTime = 0;
        this.pitBot.reset();
        this.stintGuide.reset();
        this.paused = false;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.ensureTickLoop();
        return true;
    }
    reloadDefinitions() {
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        const ok = this.session.reloadDefinitions?.() ??
            this.session.initFromRaceConfig(this.configPathForSim());
        process.chdir(prevCwd);
        if (!ok)
            return false;
        this.inRaceSession = false;
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.simTimestep = this.parsedConfig.simTimestep;
        this.trackName = (0, config_parser_1.loadTrackName)(this.repoRoot, this.parsedConfig.trackConfigPath);
        this.refreshEntriesFromConfig();
        this.raceTime = 0;
        this.pitBot.reset();
        this.stintGuide.reset();
        this.paused = true;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.meta.reload();
        this.restartTickLoop();
        return true;
    }
    enrichSnapshots(snapshots) {
        const numbersByEntryId = new Map(this.entries.map((entry) => [entry.entryId, entry.carNumber]));
        return snapshots.map((snap) => {
            const fromSim = typeof snap.carNumber === "string" && snap.carNumber ? snap.carNumber : "";
            const fromEntry = numbersByEntryId.get(snap.entryId) ?? "";
            const carNumber = fromSim || fromEntry;
            return carNumber ? { ...snap, carNumber } : snap;
        });
    }
    configPathForSim() {
        const rel = path.relative(this.repoRoot, this.raceConfigPath);
        return rel.startsWith("..") ? this.raceConfigPath : rel;
    }
    ensureTickLoop() {
        if (this.tickTimer || !this.onTick)
            return;
        const intervalMs = Math.max(16, this.simTimestep * 1000);
        this.tickTimer = setInterval(() => this.step(), intervalMs);
    }
    restartTickLoop() {
        this.stop();
        this.ensureTickLoop();
    }
    runPitBot() {
        if (!this.session.submitCommand)
            return;
        const snapshots = this.session.getSnapshots();
        const raceControl = this.getRaceControl();
        const rivalSeason = this.meta.getState().aiRivalSeason;
        const raceTime = this.getRaceTime();
        this.stintGuide.observe(snapshots, this.runtimeManagedEntryIds, {
            trackName: this.trackName,
            targetDurationSeconds: this.sessionExtra.targetDurationSeconds,
            raceTimeSec: raceTime,
        });
        this.pitBot.tick(snapshots, this.runtimeManagedEntryIds, {
            trackWetness: raceControl?.trackWetness,
            weekendSessionType: this.sessionExtra.weekendSessionType,
            rivalPitAggression: (teamName) => (0, ai_rival_season_1.rivalModifiersForTeam)(teamName, rivalSeason).pitAggression,
            getStintPlan: (entryId) => this.stintGuide.getPlan(entryId),
        }, (entryId, command) => this.session.submitCommand(entryId, command));
    }
    step() {
        if (this.paused || this.timeScale === 0)
            return;
        if (this.session.isRaceComplete())
            return;
        // Always integrate physics at sim_timestep — large steps overheat engines and
        // spike vibration damage when time compression multiplies delta in one tick.
        const frameDelta = this.simTimestep * this.timeScale;
        let remaining = frameDelta;
        let pitBotAccumSec = 0;
        const PITBOT_INTERVAL_SEC = 1.0;
        while (remaining > 1e-9) {
            const dt = Math.min(this.simTimestep, remaining);
            this.session.tick(dt);
            remaining -= dt;
            pitBotAccumSec += dt;
            if (pitBotAccumSec >= PITBOT_INTERVAL_SEC &&
                !this.session.isRaceComplete()) {
                pitBotAccumSec = 0;
                this.runPitBot();
            }
        }
        this.raceTime += frameDelta;
        if (pitBotAccumSec > 0 && !this.session.isRaceComplete()) {
            this.runPitBot();
        }
        const snapshots = this.enrichSnapshots(this.session.getSnapshots());
        const raceTime = this.getRaceTime();
        const rawEvents = this.session.drainEvents();
        const events = this.applyCommandAttribution(rawEvents.map((e) => typeof e.type === "string" && e.type.includes("_")
            ? (0, adapters_1.normalizeEvent)(e)
            : e));
        if (events.length > 0) {
            this.onEvents?.(events);
            if (events.some((e) => e.type === "RaceComplete")) {
                this.onRaceComplete?.(raceTime, snapshots.map((s) => ({
                    entryId: s.entryId,
                    teamName: s.teamName,
                    carNumber: s.carNumber,
                    classId: s.classId,
                    position: s.racePosition,
                    bestLapTime: s.bestLapTime ?? 0,
                    driverName: s.driverName,
                })), this.getWeekendSessionType());
                this.paused = true;
            }
        }
        this.onTick?.(raceTime, snapshots);
    }
}
exports.SimHost = SimHost;
