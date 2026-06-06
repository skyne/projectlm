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
exports.loadClassRules = loadClassRules;
exports.sanitizeCarConfigText = sanitizeCarConfigText;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const COOLING_ALIASES = {
    MaxFlowEndurance: "EnduranceHeavyDuty",
    DuctedRacing: "EnduranceHeavyDuty",
};
function loadClassRules(repoRoot) {
    const rules = new Map();
    const abs = path.join(repoRoot, "configs/class_rules.txt");
    if (!fs.existsSync(abs))
        return rules;
    let current = null;
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key === "class") {
            if (current)
                rules.set(current.id, current);
            current = {
                id: value,
                legalCooling: [],
                legalChassis: [],
                legalFrontAero: [],
                legalRearAero: [],
                legalBrakes: [],
                legalTransmission: [],
                legalHybrid: [],
            };
            continue;
        }
        if (!current)
            continue;
        const list = value.split(",").map((v) => v.trim()).filter(Boolean);
        if (key === "legal_cooling")
            current.legalCooling = list;
        else if (key === "legal_chassis")
            current.legalChassis = list;
        else if (key === "legal_front_aero")
            current.legalFrontAero = list;
        else if (key === "legal_rear_aero")
            current.legalRearAero = list;
        else if (key === "legal_brakes")
            current.legalBrakes = list;
        else if (key === "legal_transmission")
            current.legalTransmission = list;
        else if (key === "legal_hybrid")
            current.legalHybrid = list;
    }
    if (current)
        rules.set(current.id, current);
    return rules;
}
function normalizeCooling(value) {
    return COOLING_ALIASES[value] ?? value;
}
function fixField(key, val, field, legal, alias = (v) => v) {
    if (key !== field || legal.length === 0)
        return null;
    const normalized = alias(val);
    if (legal.includes(normalized)) {
        if (normalized !== val)
            return { line: `${field}=${normalized}`, fix: `${field}: ${val} -> ${normalized}` };
        return { line: `${field}=${val}` };
    }
    const fallback = legal[0];
    return { line: `${field}=${fallback}`, fix: `${field}: ${val} -> ${fallback}` };
}
function sanitizeCarConfigText(configText, classId, rules) {
    const rule = rules.get(classId);
    if (!rule)
        return { text: configText, fixes: [] };
    const fixes = [];
    const lines = configText.split("\n").map((rawLine) => {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
            return rawLine;
        const eq = trimmed.indexOf("=");
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        const attempts = [
            fixField(key, val, "cooling_pack", rule.legalCooling, normalizeCooling),
            fixField(key, val, "chassis_type", rule.legalChassis),
            fixField(key, val, "front_aero_type", rule.legalFrontAero),
            fixField(key, val, "rear_aero_type", rule.legalRearAero),
            fixField(key, val, "brake_system", rule.legalBrakes),
            fixField(key, val, "transmission", rule.legalTransmission),
            fixField(key, val, "hybrid_system", rule.legalHybrid),
        ];
        for (const attempt of attempts) {
            if (!attempt)
                continue;
            if (attempt.fix) {
                fixes.push(attempt.fix);
                return attempt.line;
            }
            return attempt.line;
        }
        return rawLine;
    });
    return { text: lines.join("\n"), fixes };
}
