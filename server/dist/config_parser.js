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
exports.parseCarNumber = parseCarNumber;
exports.legacyEntryIdFromGrid = legacyEntryIdFromGrid;
exports.parseEntryFields = parseEntryFields;
exports.formatEntryLine = formatEntryLine;
exports.parseRaceConfig = parseRaceConfig;
exports.parseEntries = parseEntries;
exports.loadTrackName = loadTrackName;
exports.loadMapLabels = loadMapLabels;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseCarNumber(raw, fallbackGrid) {
    const trimmed = raw?.trim() ?? "";
    if (/^\d+$/.test(trimmed) && trimmed !== "0")
        return trimmed;
    return String(fallbackGrid);
}
/** Legacy id when entry_id column is absent — unique only for global grid slots. */
function legacyEntryIdFromGrid(grid) {
    return `entry-${grid}`;
}
/** Parse `entry=team,path,class,grid,car_number[,entry_id]` */
function parseEntryFields(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("entry=")) {
        return null;
    }
    const parts = trimmed.slice("entry=".length).split(",");
    if (parts.length < 4)
        return null;
    const grid = parseInt(parts[3].trim(), 10);
    if (!Number.isFinite(grid) || grid <= 0)
        return null;
    const teamName = parts[0].trim();
    const carConfigPath = parts[1].trim();
    const classId = parts[2].trim();
    if (!teamName || !carConfigPath || !classId)
        return null;
    const carNumber = parseCarNumber(parts[4], grid);
    const explicitId = parts[5]?.trim();
    const entryId = explicitId && explicitId.length > 0 ? explicitId : legacyEntryIdFromGrid(grid);
    return { teamName, carConfigPath, classId, grid, carNumber, entryId };
}
function formatEntryLine(fields) {
    return `entry=${fields.teamName},${fields.carConfigPath},${fields.classId},${fields.grid},${fields.carNumber},${fields.entryId}`;
}
function parseRaceConfig(repoRoot, configPath) {
    const abs = path.isAbsolute(configPath)
        ? configPath
        : path.join(repoRoot, configPath);
    const text = fs.readFileSync(abs, "utf8");
    const config = {
        trackConfigPath: "tracks/sample_circuit.json",
        targetLaps: 0,
        targetDurationSeconds: 0,
        simTimestep: 0.1,
        entriesPath: "",
        classRulesPath: "configs/class_rules.txt",
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
        else if (key === "target_duration_hours")
            config.targetDurationSeconds = parseFloat(val) * 3600;
        else if (key === "target_duration_seconds")
            config.targetDurationSeconds = parseFloat(val);
        else if (key === "sim_timestep")
            config.simTimestep = parseFloat(val);
        else if (key === "entries")
            config.entriesPath = val;
        else if (key === "class_rules")
            config.classRulesPath = val;
    }
    return config;
}
function parseEntries(repoRoot, entriesPath) {
    const abs = path.join(repoRoot, entriesPath);
    const rows = [];
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const parsed = parseEntryFields(line);
        if (!parsed)
            continue;
        rows.push({
            entryId: parsed.entryId,
            teamName: parsed.teamName,
            carNumber: parsed.carNumber,
            classId: parsed.classId,
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
