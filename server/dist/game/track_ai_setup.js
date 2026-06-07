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
exports.applyAiTrackSetupToConfig = applyAiTrackSetupToConfig;
exports.materializeAiGridConfigs = materializeAiGridConfigs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const weekend_setup_1 = require("./weekend_setup");
/** Patch an on-disk car config with AI grid baseline for this track. */
function applyAiTrackSetupToConfig(repoRoot, carConfigPath, trackId, classId, rivalModifiers) {
    const abs = path.join(repoRoot, carConfigPath);
    if (!fs.existsSync(abs))
        return;
    const preset = (0, weekend_setup_1.defaultTrackPreset)(trackId);
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    const out = [];
    const replaced = new Set();
    const setLine = (key, value) => {
        replaced.add(key);
        out.push(`${key}=${value}`);
    };
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            out.push(line);
            continue;
        }
        const eq = trimmed.indexOf("=");
        if (eq <= 0) {
            out.push(line);
            continue;
        }
        const key = trimmed.slice(0, eq);
        if (key === "duct_airflow" ||
            key === "starting_wing_delta" ||
            key === "starting_brake_bias") {
            continue;
        }
        // Only strip suspension keys when the track preset supplies a replacement.
        const stripIfPreset = (presetKey, lineKey) => {
            if (key === lineKey && preset[presetKey] != null)
                return true;
            return false;
        };
        if (stripIfPreset("frontRideHeightMm", "front_ride_height_m") ||
            stripIfPreset("rearRideHeightMm", "rear_ride_height_m") ||
            (key === "ride_height" &&
                preset.frontRideHeightMm != null &&
                preset.rearRideHeightMm != null) ||
            stripIfPreset("frontSpringNm", "front_spring_stiffness") ||
            stripIfPreset("rearSpringNm", "rear_spring_stiffness") ||
            stripIfPreset("frontArbStiffness", "front_arb_stiffness") ||
            stripIfPreset("rearArbStiffness", "rear_arb_stiffness") ||
            stripIfPreset("frontDamperBump", "front_damper_bump") ||
            stripIfPreset("frontDamperRebound", "front_damper_rebound") ||
            stripIfPreset("rearDamperBump", "rear_damper_bump") ||
            stripIfPreset("rearDamperRebound", "rear_damper_rebound")) {
            continue;
        }
        out.push(line);
    }
    if (preset.frontRideHeightMm != null) {
        setLine("front_ride_height_m", (preset.frontRideHeightMm / 1000).toFixed(4));
    }
    if (preset.rearRideHeightMm != null) {
        setLine("rear_ride_height_m", (preset.rearRideHeightMm / 1000).toFixed(4));
    }
    if (preset.frontRideHeightMm != null && preset.rearRideHeightMm != null) {
        setLine("ride_height", ((preset.frontRideHeightMm + preset.rearRideHeightMm) /
            2 /
            1000).toFixed(4));
    }
    if (preset.frontSpringNm != null) {
        setLine("front_spring_stiffness", String(preset.frontSpringNm));
    }
    if (preset.rearSpringNm != null) {
        setLine("rear_spring_stiffness", String(preset.rearSpringNm));
    }
    if (preset.frontArbStiffness != null) {
        setLine("front_arb_stiffness", preset.frontArbStiffness.toFixed(2));
    }
    if (preset.rearArbStiffness != null) {
        setLine("rear_arb_stiffness", preset.rearArbStiffness.toFixed(2));
    }
    if (preset.frontDamperBump != null) {
        const damperRival = rivalModifiers?.damperBumpDelta ?? 0;
        const jitter = classId === "LMGT3" ? 0 : classId === "LMP2" ? 1 : 2;
        setLine("front_damper_bump", String(Math.min(15, Math.max(4, preset.frontDamperBump + jitter + damperRival))));
    }
    else {
        const jitter = classId === "LMGT3" ? 0 : classId === "LMP2" ? 1 : 2;
        const damperRival = rivalModifiers?.damperBumpDelta ?? 0;
        if (!replaced.has("front_damper_bump")) {
            const base = readNumeric(lines, "front_damper_bump") ?? 8;
            setLine("front_damper_bump", String(Math.min(15, Math.max(4, base + jitter + damperRival))));
        }
    }
    if (preset.frontDamperRebound != null) {
        setLine("front_damper_rebound", String(preset.frontDamperRebound));
    }
    if (preset.rearDamperBump != null) {
        setLine("rear_damper_bump", String(preset.rearDamperBump));
    }
    if (preset.rearDamperRebound != null) {
        setLine("rear_damper_rebound", String(preset.rearDamperRebound));
    }
    if (preset.ductAirflow != null) {
        setLine("duct_airflow", preset.ductAirflow.toFixed(2));
    }
    const wingBase = preset.wingBaseline ?? 0;
    const wingDelta = rivalModifiers?.wingDelta ?? 0;
    setLine("starting_wing_delta", (wingBase + wingDelta).toFixed(3));
    if (preset.brakeBiasBaseline != null) {
        setLine("starting_brake_bias", preset.brakeBiasBaseline.toFixed(3));
    }
    if (rivalModifiers?.ductAirflowDelta) {
        const base = readNumeric(lines, "duct_airflow") ?? preset.ductAirflow ?? 1;
        setLine("duct_airflow", (base + rivalModifiers.ductAirflowDelta).toFixed(2));
    }
    out.push(`# AI track setup: ${trackId}`);
    fs.writeFileSync(abs, out.join("\n") + "\n");
}
function readNumeric(lines, key) {
    for (const line of lines) {
        if (line.startsWith(`${key}=`)) {
            const v = parseFloat(line.slice(key.length + 1));
            return Number.isFinite(v) ? v : null;
        }
    }
    return null;
}
/** Apply per-track AI baselines to runtime grid configs. */
function materializeAiGridConfigs(repoRoot, entries, trackId, rivalModifiersForTeam) {
    for (const entry of entries) {
        if (entry.isPlayer)
            continue;
        applyAiTrackSetupToConfig(repoRoot, entry.carConfigPath, trackId, entry.classId, rivalModifiersForTeam?.(entry.teamName));
    }
}
