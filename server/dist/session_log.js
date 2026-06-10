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
exports.SessionLogWriter = void 0;
exports.listSessionLogs = listSessionLogs;
exports.readSessionLog = readSessionLog;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const INCIDENT_TYPES = new Set([
    "Collision",
    "Retirement",
    "Blocked",
    "RacingIncident",
    "Stranded",
    "PenaltyIssued",
    "PenaltyWarning",
    "Disqualified",
]);
function logDir(repoRoot) {
    return path.join(repoRoot, "server", "data", "session_logs");
}
function indexPath(repoRoot) {
    return path.join(logDir(repoRoot), "index.json");
}
function readIndex(repoRoot) {
    const file = indexPath(repoRoot);
    if (!fs.existsSync(file))
        return [];
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return [];
    }
}
function writeIndex(repoRoot, entries) {
    fs.mkdirSync(logDir(repoRoot), { recursive: true });
    const trimmed = entries.slice(0, 200);
    fs.writeFileSync(indexPath(repoRoot), JSON.stringify(trimmed, null, 2) + "\n");
}
class SessionLogWriter {
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        this.activeId = null;
        this.events = [];
        this.meta = {
            trackName: "",
            roundNumber: 0,
            weekendSessionType: "race",
            raceFormat: "",
            teamName: "",
        };
    }
    startSession(meta) {
        this.activeId = `${Date.now()}_${meta.roundNumber}_${meta.weekendSessionType}`;
        this.events = [];
        this.meta = { ...meta, raceTimeSec: 0 };
        return this.activeId;
    }
    recordEvents(events) {
        if (!this.activeId || events.length === 0)
            return;
        this.events.push(...events);
    }
    finishSession(raceTimeSec, results) {
        if (!this.activeId)
            return null;
        const id = this.activeId;
        const savedAt = new Date().toISOString();
        const incidentCount = this.events.filter((e) => INCIDENT_TYPES.has(e.type)).length;
        const entry = {
            id,
            savedAt,
            trackName: this.meta.trackName,
            roundNumber: this.meta.roundNumber,
            weekendSessionType: this.meta.weekendSessionType,
            raceFormat: this.meta.raceFormat,
            teamName: this.meta.teamName,
            raceTimeSec,
            eventCount: this.events.length,
            incidentCount,
        };
        const payload = {
            meta: entry,
            events: this.events,
            results,
        };
        fs.mkdirSync(logDir(this.repoRoot), { recursive: true });
        fs.writeFileSync(path.join(logDir(this.repoRoot), `${id}.json`), JSON.stringify(payload, null, 2) + "\n");
        writeIndex(this.repoRoot, [entry, ...readIndex(this.repoRoot)]);
        this.activeId = null;
        this.events = [];
        return entry;
    }
    getActiveId() {
        return this.activeId;
    }
    /** In-memory events for the live session (replay on viewer reconnect). */
    getActiveEvents() {
        return [...this.events];
    }
}
exports.SessionLogWriter = SessionLogWriter;
function listSessionLogs(repoRoot) {
    return readIndex(repoRoot);
}
function readSessionLog(repoRoot, id) {
    if (!/^[\w.-]+$/.test(id))
        return null;
    const file = path.join(logDir(repoRoot), `${id}.json`);
    if (!fs.existsSync(file))
        return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return null;
    }
}
