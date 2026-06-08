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
exports.SLOT_FROM_PREFIX = exports.CAR_FIELD_BY_SLOT = void 0;
exports.parseEngineFromTemplate = parseEngineFromTemplate;
exports.generateStaffCandidates = generateStaffCandidates;
exports.loadGameCatalog = loadGameCatalog;
exports.defaultBuildForClass = defaultBuildForClass;
exports.defaultWheelPackageForClass = defaultWheelPackageForClass;
exports.defaultSuspensionForClass = defaultSuspensionForClass;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const driver_catalog_1 = require("./driver_catalog");
const driver_market_1 = require("./driver_market");
const car_marketplace_1 = require("./car_marketplace");
const fleet_1 = require("./fleet");
const engine_model_1 = require("./engine_model");
const economy_1 = require("./economy");
const regulations_1 = require("./regulations");
const part_compatibility_1 = require("./part_compatibility");
const class_rules_1 = require("./class_rules");
const CLASS_DESCRIPTIONS = {
    Hypercar: "Top-tier hybrid prototypes. Maximum pace, complex energy recovery, and the highest development ceiling.",
    LMP2: "Spec-balanced prototype class. Consistent lap times, lower cost, ideal for learning race strategy.",
    LMGT3: "Production-based GT machinery. Heavy BoP, high downforce, and tight pack racing at endurance events.",
};
const SLOT_FROM_PREFIX = {
    chassis: "chassis",
    front_aero: "front_aero",
    rear_aero: "rear_aero",
    diffuser: "diffuser",
    exhaust: "exhaust",
    cooling: "cooling",
    wheel_package: "wheel_package",
    suspension: "suspension",
    fuel_system: "fuel_system",
    brake: "brake",
    transmission: "transmission",
    hybrid: "hybrid",
};
exports.SLOT_FROM_PREFIX = SLOT_FROM_PREFIX;
const CAR_FIELD_BY_SLOT = {
    chassis: "chassis_type",
    front_aero: "front_aero_type",
    rear_aero: "rear_aero_type",
    diffuser: "diffuser_type",
    exhaust: "exhaust_type",
    cooling: "cooling_pack",
    wheel_package: "wheel_package",
    suspension: "suspension_layout",
    fuel_system: "fuel_system",
    brake: "brake_system",
    transmission: "transmission",
    hybrid: "hybrid_system",
};
exports.CAR_FIELD_BY_SLOT = CAR_FIELD_BY_SLOT;
function humanizePartName(type) {
    return type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}
function parsePartCatalog(repoRoot) {
    const catalogPath = path.join(repoRoot, "configs/part_catalog.txt");
    const parts = new Map();
    if (!fs.existsSync(catalogPath))
        return parts;
    let currentPrefix = "";
    let currentType = "";
    let stats = {};
    let mass = 0;
    const flush = () => {
        if (!currentPrefix || !currentType)
            return;
        const slot = SLOT_FROM_PREFIX[currentPrefix];
        if (!slot)
            return;
        parts.set(`${currentPrefix}.${currentType}`, {
            slot,
            partType: currentType,
            fullId: `${currentPrefix}.${currentType}`,
            displayName: humanizePartName(currentType),
            mass,
            stats: { ...stats },
        });
    };
    for (const line of fs.readFileSync(catalogPath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("attach."))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const left = trimmed.slice(0, eq);
        const val = parseFloat(trimmed.slice(eq + 1));
        const segments = left.split(".");
        if (segments.length < 3)
            continue;
        const prefix = segments[0];
        const partType = segments[1];
        const statKey = segments.slice(2).join(".");
        if (prefix !== currentPrefix || partType !== currentType) {
            flush();
            currentPrefix = prefix;
            currentType = partType;
            stats = {};
            mass = 0;
        }
        if (statKey === "mass")
            mass = val;
        else if (!Number.isNaN(val))
            stats[statKey] = val;
    }
    flush();
    return parts;
}
function parseClassRules(repoRoot) {
    return (0, class_rules_1.loadParsedClassRules)(repoRoot).map(classRuleToInfo);
}
function classRuleToInfo(rule) {
    return {
        id: rule.id,
        displayName: rule.displayName,
        description: rule.description ?? CLASS_DESCRIPTIONS[rule.id] ?? "",
        powerCapHp: rule.powerCapHp,
        minWeightKg: rule.minWeightKg,
        maxWeightKg: rule.maxWeightKg,
        maxStintHours: rule.maxStintHours,
        templateCarPath: rule.templateCarPath,
        legalParts: rule.legalParts,
    };
}
const STAFF_POOL = [
    { role: "engineer", names: ["Marie Chen", "Luca Rossi", "Yuki Tanaka", "Elena Voss"] },
    { role: "mechanic", names: ["Jean Dupont", "Marcus Webb", "Sofia Reyes", "Tom Becker"] },
    { role: "strategist", names: ["Sam Okoye", "Priya Sharma", "Oliver Kent", "Ines Alvarez"] },
];
const ENGINE_KEYS = new Set([
    "engine_layout",
    "fuel_type",
    "cylinders",
    "bore",
    "stroke",
    "max_rpm",
    "peak_torque_nm",
    "peak_torque_rpm",
    "base_vibration",
    "aspiration",
    "drivetrain",
    "energy_converter",
    "buffer_size",
    "generator_kw",
]);
function parseEngineFromTemplate(repoRoot, templatePath) {
    const abs = path.join(repoRoot, templatePath);
    if (!fs.existsSync(abs))
        return null;
    const raw = {};
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (ENGINE_KEYS.has(key))
            raw[key] = val;
    }
    if (!raw.engine_layout)
        return null;
    const layout = raw.engine_layout;
    return {
        engine_layout: layout,
        fuel_type: raw.fuel_type ?? "Gasoline",
        cylinders: raw.cylinders
            ? parseInt(raw.cylinders, 10)
            : (0, engine_model_1.cylindersForLayout)(layout),
        bore: parseFloat(raw.bore ?? "0.096"),
        stroke: parseFloat(raw.stroke ?? "0.080"),
        max_rpm: parseInt(raw.max_rpm ?? "8000", 10),
        peak_torque_nm: parseFloat(raw.peak_torque_nm ?? "500"),
        peak_torque_rpm: parseInt(raw.peak_torque_rpm ?? "6500", 10),
        base_vibration: parseFloat(raw.base_vibration ?? "1.0"),
        aspiration: raw.aspiration,
        drivetrain: raw.drivetrain,
        energy_converter: raw.energy_converter,
        buffer_size: raw.buffer_size ? parseFloat(raw.buffer_size) : undefined,
        generator_kw: raw.generator_kw ? parseFloat(raw.generator_kw) : undefined,
    };
}
function generateStaffCandidates() {
    const out = [];
    for (const pool of STAFF_POOL) {
        for (const name of pool.names) {
            const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
            const skill = 62 + (seed % 28);
            out.push({
                role: pool.role,
                name,
                skill,
                salary: 120000 + skill * 1500,
            });
        }
    }
    return out;
}
function loadGameCatalog(repoRoot) {
    const allParts = parsePartCatalog(repoRoot);
    const classes = parseClassRules(repoRoot);
    const partsBySlot = {};
    for (const slot of Object.keys(SLOT_FROM_PREFIX)) {
        partsBySlot[slot] = [...allParts.values()].filter((p) => p.slot === slot);
    }
    const lemansDrivers = (0, driver_catalog_1.loadLeMansDriverCatalog)(repoRoot);
    let lemansDriverCount = 0;
    for (const roster of lemansDrivers.values())
        lemansDriverCount += roster.length;
    const defaultEngines = {};
    for (const cls of classes) {
        if (!cls.templateCarPath)
            continue;
        const engine = parseEngineFromTemplate(repoRoot, cls.templateCarPath);
        if (engine)
            defaultEngines[cls.id] = engine;
    }
    return {
        classes,
        partsBySlot,
        staffCandidates: generateStaffCandidates(),
        sponsorOffers: (0, economy_1.sponsorOffersPayload)(),
        ruleChangeProposals: regulations_1.RULE_CHANGE_PROPOSALS,
        carPlatforms: (0, car_marketplace_1.loadCarPlatforms)(repoRoot),
        fleetRules: (0, fleet_1.fleetRulesPayload)(),
        driverStatDefs: driver_catalog_1.DRIVER_STAT_DEFS,
        driverPointPool: driver_catalog_1.DRIVER_POINT_POOL,
        lemansDriverCount,
        driverMarketPreview: (0, driver_market_1.buildDriverMarketPreview)(repoRoot),
        defaultEngines,
        assemblyRules: (0, part_compatibility_1.loadAssemblyRules)(repoRoot),
    };
}
function defaultBuildForClass(repoRoot, classId) {
    const classes = parseClassRules(repoRoot);
    const info = classes.find((c) => c.id === classId);
    if (!info?.templateCarPath)
        return null;
    const abs = path.join(repoRoot, info.templateCarPath);
    if (!fs.existsSync(abs))
        return null;
    const build = { carName: `${classId} Race Car` };
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
            build.carName = val;
        else if (Object.values(CAR_FIELD_BY_SLOT).includes(key))
            build[key] = val;
        else if (ENGINE_KEYS.has(key))
            build[key] = val;
    }
    return build;
}
function defaultWheelPackageForClass(classId) {
    if (classId === "LMGT3")
        return "GT3Front20Rear21";
    if (classId === "LMP2")
        return "LMP2Oreca18";
    return "Hypercar18Standard";
}
function defaultSuspensionForClass(classId) {
    if (classId === "LMGT3")
        return "DoubleWishboneGT3";
    if (classId === "LMP2")
        return "OrecaLMP2Spec";
    return "PushrodDoubleWishbone";
}
