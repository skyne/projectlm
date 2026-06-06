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
exports.MANUFACTURER_HYPERCAR_MIN_CARS = void 0;
exports.loadCarPlatforms = loadCarPlatforms;
exports.platformById = platformById;
exports.buildFromPlatform = buildFromPlatform;
exports.manufacturerBuildCost = manufacturerBuildCost;
exports.privateerSlotCost = privateerSlotCost;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const catalog_1 = require("./catalog");
const CLASS_BY_CHASSIS = {
    LMHMonocoque: "Hypercar",
    LMHInHouse: "Hypercar",
    LMHDallaraBuilt: "Hypercar",
    LMHMultimaticBuilt: "Hypercar",
    LMDhDallara: "Hypercar",
    LMDhOreca: "Hypercar",
    LMDhMultimatic: "Hypercar",
    LMDhLigier: "Hypercar",
    Oreca07: "LMP2",
    GT3Spaceframe: "LMGT3",
    GT3Oreca: "LMGT3",
    GT3PrattMiller: "LMGT3",
    GT3McLaren: "LMGT3",
    GT3Multimatic: "LMGT3",
};
const PRIVATEER_COST = {
    Hypercar: 1500000,
    LMP2: 350000,
    LMGT3: 400000,
};
const MANUFACTURER_BUILD_COST = {
    Hypercar: 3000000,
    LMP2: 600000,
    LMGT3: 800000,
};
const MANUFACTURER_NAMES = {
    ferrari: "Ferrari",
    toyota: "Toyota",
    peugeot: "Peugeot",
    cadillac: "Cadillac",
    bmw: "BMW",
    genesis: "Genesis",
    alpine: "Alpine",
    aston_martin: "Aston Martin",
    porsche: "Porsche",
    lamborghini: "Lamborghini",
    acura: "Acura",
    mercedes: "Mercedes-AMG",
    mclaren: "McLaren",
    lexus: "Lexus",
    ford: "Ford",
    corvette: "Corvette",
    oreca: "Oreca",
};
function humanizeManufacturer(id) {
    return (MANUFACTURER_NAMES[id] ??
        id
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "));
}
function inferClassFromConfig(lines) {
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === "chassis_type" && CLASS_BY_CHASSIS[val]) {
            return CLASS_BY_CHASSIS[val];
        }
    }
    return "Hypercar";
}
function manufacturerIdFromFilename(filename) {
    const base = filename.replace(/\.txt$/, "");
    const parts = base.split("_");
    if (parts.length >= 2 && parts[1] === "martin") {
        return "aston_martin";
    }
    return parts[0] ?? base;
}
function loadCarPlatforms(repoRoot) {
    const dir = path.join(repoRoot, "configs/cars/lemans2026");
    if (!fs.existsSync(dir))
        return [];
    const platforms = [];
    for (const filename of fs.readdirSync(dir).sort()) {
        if (!filename.endsWith(".txt"))
            continue;
        const relPath = `configs/cars/lemans2026/${filename}`;
        const abs = path.join(repoRoot, relPath);
        const lines = fs.readFileSync(abs, "utf8").split("\n");
        let displayName = filename.replace(/\.txt$/, "");
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("car_name=")) {
                displayName = trimmed.slice("car_name=".length).trim();
                break;
            }
        }
        const manufacturerId = manufacturerIdFromFilename(filename);
        const classId = inferClassFromConfig(lines);
        const id = filename.replace(/\.txt$/, "");
        platforms.push({
            id,
            displayName,
            manufacturerId,
            manufacturerName: humanizeManufacturer(manufacturerId),
            classId,
            templatePath: relPath,
            privateerCost: PRIVATEER_COST[classId] ?? 500000,
            description: `${humanizeManufacturer(manufacturerId)} ${classId} platform — privateer entry`,
        });
    }
    return platforms;
}
function platformById(repoRoot, platformId) {
    return loadCarPlatforms(repoRoot).find((p) => p.id === platformId) ?? null;
}
function buildFromPlatform(repoRoot, platform, teamName) {
    const abs = path.join(repoRoot, platform.templatePath);
    if (!fs.existsSync(abs)) {
        return (0, catalog_1.defaultBuildForClass)(repoRoot, platform.classId) ?? { carName: platform.displayName };
    }
    const build = { carName: platform.displayName };
    const fields = new Set([
        "car_name",
        "chassis_type",
        "front_aero_type",
        "rear_aero_type",
        "cooling_pack",
        "wheel_package",
        "suspension_layout",
        "fuel_system",
        "brake_system",
        "transmission",
        "hybrid_system",
        "engine_layout",
        "fuel_type",
        "cylinders",
        "bore",
        "stroke",
        "max_rpm",
        "peak_torque_nm",
        "peak_torque_rpm",
        "base_vibration",
    ]);
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === "car_name")
            build.carName = `${teamName} ${val}`;
        else if (fields.has(key))
            build[key] = val;
    }
    return build;
}
function manufacturerBuildCost(classId) {
    return MANUFACTURER_BUILD_COST[classId] ?? 1000000;
}
function privateerSlotCost(classId) {
    return PRIVATEER_COST[classId] ?? 500000;
}
exports.MANUFACTURER_HYPERCAR_MIN_CARS = 2;
