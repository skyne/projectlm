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
const fs = __importStar(require("fs"));
const adapters_1 = require("./adapters");
const config_parser_1 = require("./config_parser");
const mock_session_1 = require("./mock_session");
const ai_strategy_1 = require("./game/ai_strategy");
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
        this.sessionType = "demo";
        this.eventName = "";
        this.targetDurationMinutes = 0;
        this.raceTime = 0;
        this.timeScale = 1;
        this.paused = false;
        this.tickTimer = null;
        this.ai = new ai_strategy_1.AiStrategyManager();
        this.playerEntryId = "";
        this.repoRoot = resolveRepoRoot(options.repoRoot);
        const rel = options.raceConfigPath ?? DEFAULT_RACE_CONFIG;
        this.raceConfigPath = path.isAbsolute(rel)
            ? rel
            : path.join(this.repoRoot, rel);
        const loaded = loadSession(this.repoRoot);
        this.bindingSource = loaded.source;
        this.session = loaded.session;
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
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
        this.trackName = (0, config_parser_1.loadTrackName)(this.repoRoot, this.parsedConfig.trackConfigPath);
        if (this.parsedConfig.entriesPath) {
            this.entries = (0, config_parser_1.parseEntries)(this.repoRoot, this.parsedConfig.entriesPath);
        }
        else {
            this.entries = [
                { entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" },
            ];
        }
        console.log(`[sim_host] ${this.bindingSource} — ${this.trackName} (${this.entries.length} entries, timestep ${this.simTimestep}s)`);
    }
    getSessionInit() {
        return {
            trackName: this.trackName,
            targetLaps: this.parsedConfig.targetLaps,
            targetDurationMinutes: this.targetDurationMinutes,
            sessionType: this.sessionType,
            eventName: this.eventName,
            simTimestep: this.simTimestep,
            entries: this.entries,
            carNumberByEntryId: Object.fromEntries(this.entries.map((entry) => [entry.entryId, entry.carNumber])),
        };
    }
    setPlayerEntryId(entryId) {
        this.playerEntryId = entryId;
    }
    startRound(raceConfigRelPath, options) {
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
        if (!ok)
            return false;
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.simTimestep = this.parsedConfig.simTimestep;
        this.trackName = (0, config_parser_1.loadTrackName)(this.repoRoot, this.parsedConfig.trackConfigPath);
        this.sessionType = options.sessionType;
        this.eventName = options.eventName;
        this.targetDurationMinutes = options.targetDurationMinutes;
        if (this.parsedConfig.entriesPath) {
            this.entries = (0, config_parser_1.parseEntries)(this.repoRoot, this.parsedConfig.entriesPath);
        }
        this.raceTime = 0;
        this.paused = options.startPaused ?? true;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.restartTickLoop();
        return true;
    }
    getRaceTime() {
        return this.session.getRaceTime?.() ?? this.raceTime;
    }
    getSnapshots() {
        return this.enrichSnapshots(this.session.getSnapshots());
    }
    getTrackGeometry() {
        const raw = this.session.getTrackGeometry();
        const geometry = "polyline" in raw ? raw : (0, adapters_1.normalizeTrackGeometry)(raw);
        const mapLabels = (0, config_parser_1.loadMapLabels)(this.repoRoot, this.parsedConfig.trackConfigPath);
        if (mapLabels.length === 0)
            return geometry;
        return { ...geometry, mapLabels };
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
    restartRace() {
        const prevCwd = process.cwd();
        process.chdir(this.repoRoot);
        const ok = this.session.restartRace?.() ??
            this.session.initFromRaceConfig(this.configPathForSim());
        process.chdir(prevCwd);
        if (!ok)
            return false;
        this.raceTime = 0;
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
        this.parsedConfig = (0, config_parser_1.parseRaceConfig)(this.repoRoot, this.raceConfigPath);
        this.simTimestep = this.parsedConfig.simTimestep;
        this.trackName = (0, config_parser_1.loadTrackName)(this.repoRoot, this.parsedConfig.trackConfigPath);
        if (this.parsedConfig.entriesPath) {
            this.entries = (0, config_parser_1.parseEntries)(this.repoRoot, this.parsedConfig.entriesPath);
        }
        else {
            this.entries = [
                { entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" },
            ];
        }
        this.raceTime = 0;
        this.paused = false;
        if (this.timeScale === 0)
            this.timeScale = 1;
        this.restartTickLoop();
        return true;
    }
    enrichSnapshots(snapshots) {
        const numbersByEntryId = new Map(this.entries.map((entry) => [entry.entryId, entry.carNumber]));
        const numbersByTeamName = new Map(this.entries.map((entry) => [entry.teamName, entry.carNumber]));
        return snapshots.map((snap) => {
            const fromEntry = numbersByEntryId.get(snap.entryId) ??
                numbersByTeamName.get(snap.teamName) ??
                0;
            const carNumber = fromEntry > 0
                ? fromEntry
                : Number(snap.carNumber) > 0
                    ? Number(snap.carNumber)
                    : 0;
            return { ...snap, carNumber };
        });
    }
    getRaceControl() {
        return this.session.getRaceControl?.();
    }
    saveReplayLog() {
        const replay = this.session.getReplayLog?.();
        if (!replay || replay.length === 0)
            return;
        const outPath = path.join(this.repoRoot, "data", "last_replay.json");
        const payload = {
            rngSeed: this.session.getRngSeed?.() ?? 0,
            raceConfigPath: this.configPathForSim(),
            commands: replay,
        };
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
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
    step() {
        if (this.paused || this.timeScale === 0)
            return;
        if (this.session.isRaceComplete())
            return;
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
            this.ai.tick(snapshots, this.playerEntryId, (entryId, command) => submit(entryId, command));
        }
        this.onTick?.(raceTime, snapshots, raceControl);
        const rawEvents = this.session.drainEvents();
        const events = rawEvents.map((e) => typeof e.type === "string" && e.type.includes("_")
            ? (0, adapters_1.normalizeEvent)(e)
            : e);
        if (events.length > 0) {
            this.onEvents?.(events);
            if (events.some((e) => e.type === "RaceComplete")) {
                this.saveReplayLog();
                this.onRaceComplete?.(raceTime, snapshots.map((s) => ({
                    entryId: s.entryId,
                    teamName: s.teamName,
                    carNumber: s.carNumber,
                    classId: s.classId,
                    position: s.racePosition,
                })));
                this.stop();
            }
        }
    }
}
exports.SimHost = SimHost;
