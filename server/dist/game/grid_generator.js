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
exports.LEMANS_OFFICIAL_GRID_SIZE = exports.LEMANS_ENTRIES_PATH = void 0;
exports.loadLeMansEntries = loadLeMansEntries;
exports.loadClassTemplates = loadClassTemplates;
exports.generateGrid = generateGrid;
exports.writeEntriesFile = writeEntriesFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_parser_1 = require("../config_parser");
const experimental_entry_1 = require("./experimental_entry");
/** Official 2026 Le Mans entry list (62-car grid + optional reserves). */
exports.LEMANS_ENTRIES_PATH = "configs/entries.txt";
exports.LEMANS_OFFICIAL_GRID_SIZE = 62;
function loadLeMansEntries(repoRoot, options = {}) {
    const abs = path.join(repoRoot, exports.LEMANS_ENTRIES_PATH);
    if (!fs.existsSync(abs))
        return [];
    const entries = [];
    let inReserveSection = false;
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith("#")) {
            if (trimmed.startsWith("# Reserve Hypercar")) {
                inReserveSection = true;
            }
            continue;
        }
        if (!trimmed.startsWith("entry="))
            continue;
        if (inReserveSection && !options.includeReserves)
            continue;
        const parts = trimmed.slice("entry=".length).split(",");
        if (parts.length < 4)
            continue;
        const grid = parseInt(parts[3].trim(), 10);
        if (!Number.isFinite(grid) || grid <= 0)
            continue;
        if (!options.includeReserves && grid > exports.LEMANS_OFFICIAL_GRID_SIZE)
            continue;
        const carConfigPath = parts[1].trim();
        const configAbs = path.join(repoRoot, carConfigPath);
        if (!fs.existsSync(configAbs)) {
            console.warn(`[grid_generator] Skipping grid ${grid}: missing car config ${carConfigPath}`);
            continue;
        }
        entries.push({
            teamName: parts[0].trim(),
            carConfigPath,
            classId: parts[2].trim(),
            grid,
            carNumber: (0, config_parser_1.parseCarNumber)(parts[4], grid),
        });
    }
    entries.sort((a, b) => a.grid - b.grid);
    return entries;
}
/** Parse class_rules template_car= lines when present. */
function loadClassTemplates(repoRoot) {
    const rulesPath = path.join(repoRoot, "configs/class_rules.txt");
    const templates = new Map();
    if (!fs.existsSync(rulesPath))
        return templates;
    let currentClass = "";
    for (const line of fs.readFileSync(rulesPath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        if (trimmed.startsWith("class=")) {
            currentClass = trimmed.slice("class=".length).trim();
            continue;
        }
        if (trimmed.startsWith("template_car=") && currentClass) {
            templates.set(currentClass, trimmed.slice("template_car=".length).trim());
        }
    }
    return templates;
}
function mergePlayerFleet(base, options) {
    const playerFleet = options.playerFleet ?? [];
    const fleetByClass = new Map();
    for (const car of playerFleet) {
        const list = fleetByClass.get(car.classId) ?? [];
        list.push(car);
        fleetByClass.set(car.classId, list);
    }
    const fleetUsed = new Map();
    const merged = base.map((entry) => {
        const fleetInClass = fleetByClass.get(entry.classId) ?? [];
        const used = fleetUsed.get(entry.classId) ?? 0;
        if (used < fleetInClass.length) {
            const fleetCar = fleetInClass[used];
            fleetUsed.set(entry.classId, used + 1);
            const entryId = `entry-${entry.grid}`;
            return {
                entryId,
                teamName: options.playerTeamName,
                carConfigPath: fleetCar.carConfigPath,
                classId: fleetCar.classId,
                grid: entry.grid,
                carNumber: fleetCar.carNumber,
                isPlayer: true,
                fleetCarId: fleetCar.id,
                entryMode: (0, experimental_entry_1.fleetEntryMode)(fleetCar),
            };
        }
        const entryId = `entry-${entry.grid}`;
        const isPlayerLegacy = playerFleet.length === 0 &&
            entryId === options.playerEntryId &&
            entry.classId === (options.playerClassId ?? "Hypercar");
        return {
            entryId,
            teamName: isPlayerLegacy ? options.playerTeamName : entry.teamName,
            carConfigPath: isPlayerLegacy && options.playerCarPath
                ? options.playerCarPath
                : entry.carConfigPath,
            classId: entry.classId,
            grid: entry.grid,
            carNumber: entry.carNumber,
            isPlayer: isPlayerLegacy,
        };
    });
    for (const [classId, fleetInClass] of fleetByClass) {
        const used = fleetUsed.get(classId) ?? 0;
        if (used >= fleetInClass.length)
            continue;
        if (base.some((e) => e.classId === classId))
            continue;
        let grid = merged.reduce((max, e) => Math.max(max, e.grid), 0) + 1;
        for (let i = used; i < fleetInClass.length; i++) {
            const fleetCar = fleetInClass[i];
            const entryId = `entry-${grid}`;
            merged.push({
                entryId,
                teamName: options.playerTeamName,
                carConfigPath: fleetCar.carConfigPath,
                classId: fleetCar.classId,
                grid,
                carNumber: fleetCar.carNumber,
                isPlayer: true,
                fleetCarId: fleetCar.id,
                entryMode: (0, experimental_entry_1.fleetEntryMode)(fleetCar),
            });
            grid++;
        }
    }
    merged.sort((a, b) => a.grid - b.grid);
    return merged;
}
function generateGrid(options) {
    const base = loadLeMansEntries(options.repoRoot, {
        includeReserves: options.includeReserves,
    });
    if (base.length === 0) {
        console.warn("[grid_generator] No Le Mans entries loaded");
        return [];
    }
    return mergePlayerFleet(base, options);
}
function writeEntriesFile(repoRoot, relPath, entries) {
    const abs = path.join(repoRoot, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const lines = [
        "# Generated grid — 2026 Le Mans entry list with player fleet merged",
        "# entry=team,config,class,start_grid,car_number,entry_id",
        ...entries.map((e) => (0, config_parser_1.formatEntryLine)({
            teamName: e.teamName,
            carConfigPath: e.carConfigPath,
            classId: e.classId,
            grid: e.grid,
            carNumber: e.carNumber,
            entryId: e.entryId,
        })),
    ];
    fs.writeFileSync(abs, lines.join("\n") + "\n");
    return relPath;
}
