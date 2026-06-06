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
exports.buildRaceForSession = buildRaceForSession;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const car_builder_1 = require("./car_builder");
const track_catalog_1 = require("./track_catalog");
const grid_generator_1 = require("./grid_generator");
const weather_model_1 = require("./weather_model");
function formatDurationMinutes(format, session) {
    if (session === "practice")
        return format === "test" ? 45 : 60;
    if (session === "qualifying")
        return 15;
    switch (format) {
        case "test":
            return 30;
        case "6h":
            return 360;
        case "8h":
            return 480;
        case "24h":
            return 1440;
        case "1812km":
            return 720;
        default:
            return 180;
    }
}
function loadBaseEntries(repoRoot) {
    const runtimePath = path.join(repoRoot, "configs/runtime/entries.txt");
    if (fs.existsSync(runtimePath)) {
        return fs
            .readFileSync(runtimePath, "utf8")
            .split("\n")
            .filter((line) => line.trim().startsWith("entry="));
    }
    const fallback = path.join(repoRoot, "configs/entries.txt");
    return fs
        .readFileSync(fallback, "utf8")
        .split("\n")
        .filter((line) => line.trim().startsWith("entry="));
}
function applyQualiGrid(entryLines, qualiResults) {
    if (qualiResults.length === 0)
        return entryLines;
    const qualiByEntry = new Map(qualiResults.map((q) => [q.entryId, q.bestLapTime]));
    const parsed = entryLines.map((line) => {
        const parts = line.slice("entry=".length).split(",");
        const grid = parseInt(parts[3]?.trim() ?? "0", 10);
        const entryId = `entry-${grid}`;
        return {
            parts,
            classId: parts[2]?.trim() ?? "",
            bestLap: qualiByEntry.get(entryId) ?? Number.POSITIVE_INFINITY,
        };
    });
    const byClass = new Map();
    for (const row of parsed) {
        const list = byClass.get(row.classId) ?? [];
        list.push(row);
        byClass.set(row.classId, list);
    }
    const classOrder = [...byClass.keys()];
    let gridCounter = 1;
    const finalLines = [];
    for (const classId of classOrder) {
        const rows = byClass.get(classId);
        rows.sort((a, b) => a.bestLap - b.bestLap);
        for (const row of rows) {
            const parts = [...row.parts];
            parts[3] = String(gridCounter++);
            finalLines.push(`entry=${parts.join(",")}`);
        }
    }
    return finalLines;
}
function buildRaceForSession(repoRoot, event, session, fleet, teamName, playerEntryId, tireCompound, carSetups, qualiResults) {
    const runtimeDir = path.join(repoRoot, "configs/runtime");
    const fleetDir = path.join(runtimeDir, "fleet");
    fs.mkdirSync(fleetDir, { recursive: true });
    for (const car of fleet) {
        const setup = carSetups[car.id];
        if (!setup)
            continue;
        const outPath = path.join(repoRoot, car.carConfigPath);
        (0, car_builder_1.writeFleetCarConfig)(outPath, car.build, setup, tireCompound);
    }
    let entryLines = loadBaseEntries(repoRoot);
    for (let i = 0; i < entryLines.length; i++) {
        const parts = entryLines[i].slice("entry=".length).split(",");
        const fleetCar = fleet.find((c) => c.carNumber === parts[4]?.trim() || c.carNumber === parts[3]?.trim());
        if (fleetCar && parts[0].trim() === teamName) {
            parts[1] = fleetCar.carConfigPath;
            entryLines[i] = `entry=${parts.join(",")}`;
        }
    }
    if (session === "race" && qualiResults.length > 0) {
        entryLines = applyQualiGrid(entryLines, qualiResults);
    }
    const entriesPath = path.join(runtimeDir, "entries.txt");
    fs.writeFileSync(entriesPath, `# Runtime grid — ${session}\n${entryLines.join("\n")}\n`, "utf8");
    const gridFixes = (0, grid_generator_1.validateAndFixGrid)(repoRoot, "configs/runtime/entries.txt");
    if (gridFixes.length > 0) {
        console.log(`[race_builder] Auto-fixed ${gridFixes.length} illegal car config(s) for class rules`);
    }
    const durationMin = formatDurationMinutes(event.format, session);
    const weather = (0, weather_model_1.weatherForEvent)(event.trackId, event.format, event.round);
    const trackPath = (0, track_catalog_1.trackConfigPath)(event.trackId);
    const raceConfigPath = path.join(runtimeDir, "race.txt");
    const raceLines = [
        `# Runtime race — ${event.eventName} (${session})`,
        `part_catalog=configs/part_catalog.txt`,
        `physics_config=configs/physics_config.txt`,
        `track_config=${trackPath}`,
        `car_config=configs/car_config.txt`,
        `target_laps=0`,
        `target_duration_minutes=${durationMin}`,
        `session_type=${session}`,
        `sim_timestep=0.1`,
        `weather_profile=${weather.profile}`,
        `track_wetness=${weather.trackWetness.toFixed(3)}`,
        `ambient_temp_c=${weather.ambientTempC.toFixed(1)}`,
        `rng_seed=${20260306 + event.round}`,
        `telemetry_output=`,
        `entries=configs/runtime/entries.txt`,
        "",
    ];
    fs.writeFileSync(raceConfigPath, raceLines.join("\n"), "utf8");
    const trackAbs = path.join(repoRoot, trackPath);
    let trackName = event.trackId;
    try {
        const trackJson = JSON.parse(fs.readFileSync(trackAbs, "utf8"));
        trackName = trackJson.name ?? trackName;
    }
    catch {
        /* use trackId */
    }
    return {
        roundNumber: event.round,
        sessionType: session,
        eventName: event.eventName,
        trackName,
        raceConfigPath: "configs/runtime/race.txt",
        playerEntryId,
        targetDurationMinutes: durationMin,
    };
}
