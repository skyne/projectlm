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
exports.LEGAL_KEY_BY_SLOT = void 0;
exports.loadParsedClassRules = loadParsedClassRules;
exports.legalPartsForSlot = legalPartsForSlot;
exports.isPartLegalForClass = isPartLegalForClass;
exports.filterPartsForClass = filterPartsForClass;
exports.auditClassPartMinimums = auditClassPartMinimums;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Config keys in class_rules.txt → garage part slots. */
exports.LEGAL_KEY_BY_SLOT = {
    chassis: "legal_chassis",
    front_aero: "legal_front_aero",
    rear_aero: "legal_rear_aero",
    diffuser: "legal_diffuser",
    exhaust: "legal_exhaust",
    cooling: "legal_cooling",
    wheel_package: "legal_wheel_package",
    suspension: "legal_suspension",
    fuel_system: "legal_fuel_system",
    brake: "legal_brakes",
    transmission: "legal_transmission",
    hybrid: "legal_hybrid",
};
const CLASS_DESCRIPTIONS = {
    Hypercar: "Top-tier hybrid prototypes. Maximum pace, complex energy recovery, and the highest development ceiling.",
    LMP2: "Spec-balanced prototype class. Consistent lap times, lower cost, ideal for learning race strategy.",
    LMGT3: "Production-based GT machinery. Heavy BoP, high downforce, and tight pack racing at endurance events.",
};
const LEGAL_PREFIX = "legal_";
function slotFromLegalKey(key) {
    for (const [slot, legalKey] of Object.entries(exports.LEGAL_KEY_BY_SLOT)) {
        if (legalKey === key)
            return slot;
    }
    return null;
}
function parseLegalParts(raw) {
    const out = {};
    for (const [key, parts] of Object.entries(raw)) {
        const slot = slotFromLegalKey(key);
        if (slot)
            out[slot] = parts;
    }
    return out;
}
/** Parse all class blocks from class_rules.txt (BoP caps + legal part lists). */
function loadParsedClassRules(repoRoot) {
    const rulesPath = path.join(repoRoot, "configs/class_rules.txt");
    if (!fs.existsSync(rulesPath))
        return [];
    const classes = [];
    let current = {
        legalRaw: {},
    };
    const flush = () => {
        if (!current.id)
            return;
        classes.push({
            id: current.id,
            displayName: current.displayName ?? current.id,
            description: CLASS_DESCRIPTIONS[current.id] ?? "",
            powerCapHp: current.powerCapHp ?? 0,
            minWeightKg: current.minWeightKg ?? 0,
            maxWeightKg: current.maxWeightKg ?? 0,
            maxStintHours: current.maxStintHours ?? 0,
            templateCarPath: current.templateCarPath ?? "",
            legalParts: parseLegalParts(current.legalRaw ?? {}),
        });
    };
    for (const line of fs.readFileSync(rulesPath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === "class") {
            flush();
            current = { id: val, legalRaw: {} };
        }
        else if (key === "display_name") {
            current.displayName = val;
        }
        else if (key === "power_cap_hp") {
            current.powerCapHp = parseFloat(val);
        }
        else if (key === "min_weight_kg") {
            current.minWeightKg = parseFloat(val);
        }
        else if (key === "max_weight_kg") {
            current.maxWeightKg = parseFloat(val);
        }
        else if (key === "max_driver_stint_hours") {
            current.maxStintHours = parseFloat(val);
        }
        else if (key === "template_car") {
            current.templateCarPath = val;
        }
        else if (key.startsWith(LEGAL_PREFIX)) {
            current.legalRaw ?? (current.legalRaw = {});
            current.legalRaw[key] = val.split(",").map((s) => s.trim()).filter(Boolean);
        }
    }
    flush();
    return classes;
}
function legalPartsForSlot(classInfo, slot) {
    const list = classInfo?.legalParts[slot];
    if (!list?.length)
        return undefined;
    return new Set(list);
}
function isPartLegalForClass(classInfo, slot, partType) {
    const allowed = legalPartsForSlot(classInfo, slot);
    if (!allowed)
        return true;
    return allowed.has(partType);
}
function filterPartsForClass(classInfo, slot, parts) {
    const allowed = legalPartsForSlot(classInfo, slot);
    if (!allowed)
        return parts;
    return parts.filter((p) => allowed.has(p.partType));
}
const GARAGE_PART_SLOTS = [
    "chassis",
    "front_aero",
    "rear_aero",
    "diffuser",
    "exhaust",
    "cooling",
    "wheel_package",
    "suspension",
    "fuel_system",
    "brake",
    "transmission",
    "hybrid",
];
/** Ensures every class has ≥ minOptions selectable parts per garage slot. */
function auditClassPartMinimums(classes, partsBySlot, minOptions = 3) {
    const failures = [];
    for (const cls of classes) {
        for (const slot of GARAGE_PART_SLOTS) {
            const visible = filterPartsForClass(cls, slot, partsBySlot[slot] ?? []);
            if (visible.length < minOptions) {
                failures.push(`${cls.id}.${slot}: ${visible.length} visible (need ${minOptions}) — ${visible.map((p) => p.partType).join(", ") || "none"}`);
            }
        }
    }
    return failures;
}
