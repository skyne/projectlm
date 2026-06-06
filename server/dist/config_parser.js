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
exports.parseRaceConfig = parseRaceConfig;
exports.parseEntries = parseEntries;
exports.loadTrackName = loadTrackName;
exports.loadMapLabels = loadMapLabels;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseRaceConfig(repoRoot, configPath) {
    const abs = path.isAbsolute(configPath)
        ? configPath
        : path.join(repoRoot, configPath);
    const text = fs.readFileSync(abs, "utf8");
    const config = {
        trackConfigPath: "tracks/sample_circuit.json",
        targetLaps: 1,
        targetDurationMinutes: 0,
        sessionType: "race",
        simTimestep: 0.1,
        entriesPath: "",
    };
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === "track_config")
            config.trackConfigPath = val;
        else if (key === "target_laps")
            config.targetLaps = parseInt(val, 10);
        else if (key === "target_duration_minutes")
            config.targetDurationMinutes = parseFloat(val);
        else if (key === "session_type")
            config.sessionType = val;
        else if (key === "sim_timestep")
            config.simTimestep = parseFloat(val);
        else if (key === "entries")
            config.entriesPath = val;
    }
    return config;
}
function parseEntries(repoRoot, entriesPath) {
    const abs = path.join(repoRoot, entriesPath);
    const rows = [];
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        if (!trimmed.startsWith("entry="))
            continue;
        const parts = trimmed.slice("entry=".length).split(",");
        if (parts.length < 4)
            continue;
        const grid = parseInt(parts[3].trim(), 10);
        if (!Number.isFinite(grid) || grid <= 0)
            continue;
        const carNumber = parts.length >= 5 ? parseInt(parts[4].trim(), 10) : grid;
        rows.push({
            entryId: `entry-${grid}`,
            teamName: parts[0].trim(),
            carNumber: Number.isFinite(carNumber) && carNumber > 0 ? carNumber : grid,
            classId: parts[2].trim(),
        });
    }
    return rows;
}
function loadTrackName(repoRoot, trackPath) {
    const abs = path.join(repoRoot, trackPath);
    const track = JSON.parse(fs.readFileSync(abs, "utf8"));
    return track.name ?? "Unknown";
}
function loadMapLabels(repoRoot, trackPath) {
    const abs = path.join(repoRoot, trackPath);
    const track = JSON.parse(fs.readFileSync(abs, "utf8"));
    return track.map_labels ?? [];
}
