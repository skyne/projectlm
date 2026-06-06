"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTrackPreset = defaultTrackPreset;
exports.resolveTrackPreset = resolveTrackPreset;
exports.resolveCarTrackPreset = resolveCarTrackPreset;
exports.mergeBuildWithTrackPreset = mergeBuildWithTrackPreset;
exports.validateTrackPreset = validateTrackPreset;
const track_catalog_1 = require("./track_catalog");
/** Suggested baseline offsets per track (applied when no saved preset). */
const TRACK_DEFAULTS = {
    lemans_la_sarthe: {
        wingBaseline: -0.05,
        ductAirflow: 0.92,
        rearRideHeightMm: 42,
        frontRideHeightMm: 38,
        notes: "Low drag — Mulsanne; slightly raked rear",
    },
    spa: {
        wingBaseline: 0.05,
        frontArbStiffness: 1.05,
        rearArbStiffness: 0.95,
        notes: "High DF — Eau Rouge / Pouhon",
    },
    monza: {
        wingBaseline: -0.08,
        ductAirflow: 0.88,
        notes: "Minimum drag profile",
    },
    fuji: {
        wingBaseline: 0.03,
        frontDamperBump: 9,
        notes: "Medium-high speed corners — stable platform",
    },
    bahrain: {
        rearRideHeightMm: 40,
        frontSpringNm: 130000,
        rearSpringNm: 155000,
        notes: "Tyre thermal management — rear-biased spring",
    },
};
function defaultTrackPreset(trackId) {
    const base = TRACK_DEFAULTS[trackId] ?? {};
    return {
        trackId,
        label: (0, track_catalog_1.trackDisplayName)(trackId),
        ...base,
    };
}
function resolveTrackPreset(trackId, saved) {
    if (saved && saved.trackId === trackId) {
        return { ...defaultTrackPreset(trackId), ...saved, trackId };
    }
    return defaultTrackPreset(trackId);
}
/** Per-car preset with legacy meta-level fallback. */
function resolveCarTrackPreset(car, trackId, meta) {
    const saved = car.trackSetupPresets?.[trackId] ?? meta.trackSetupPresets?.[trackId] ?? null;
    return resolveTrackPreset(trackId, saved);
}
/** Merge weekend sheet onto garage platform build (does not mutate garage save). */
function mergeBuildWithTrackPreset(build, preset) {
    if (!preset)
        return build;
    return {
        ...build,
        ...(preset.ductAirflow != null ? { duct_airflow: preset.ductAirflow } : {}),
        ...(preset.frontRideHeightMm != null
            ? { front_ride_height_mm: preset.frontRideHeightMm }
            : {}),
        ...(preset.rearRideHeightMm != null
            ? { rear_ride_height_mm: preset.rearRideHeightMm }
            : {}),
        ...(preset.frontSpringNm != null
            ? { front_spring_nm: preset.frontSpringNm }
            : {}),
        ...(preset.rearSpringNm != null
            ? { rear_spring_nm: preset.rearSpringNm }
            : {}),
        ...(preset.frontArbStiffness != null
            ? { front_arb_stiffness: preset.frontArbStiffness }
            : {}),
        ...(preset.rearArbStiffness != null
            ? { rear_arb_stiffness: preset.rearArbStiffness }
            : {}),
        ...(preset.frontDamperBump != null
            ? { front_damper_bump: preset.frontDamperBump }
            : {}),
        ...(preset.frontDamperRebound != null
            ? { front_damper_rebound: preset.frontDamperRebound }
            : {}),
        ...(preset.rearDamperBump != null
            ? { rear_damper_bump: preset.rearDamperBump }
            : {}),
        ...(preset.rearDamperRebound != null
            ? { rear_damper_rebound: preset.rearDamperRebound }
            : {}),
        ...(preset.frontCamberDeg != null
            ? { front_camber_deg: preset.frontCamberDeg }
            : {}),
        ...(preset.rearCamberDeg != null
            ? { rear_camber_deg: preset.rearCamberDeg }
            : {}),
        ...(preset.frontToeDeg != null ? { front_toe_deg: preset.frontToeDeg } : {}),
        ...(preset.rearToeDeg != null ? { rear_toe_deg: preset.rearToeDeg } : {}),
        ...(preset.finalDriveRatio != null
            ? { final_drive_ratio: preset.finalDriveRatio }
            : {}),
        ...(preset.wingBaseline != null
            ? { starting_wing_delta: preset.wingBaseline }
            : {}),
        ...(preset.brakeBiasBaseline != null
            ? { starting_brake_bias: preset.brakeBiasBaseline }
            : {}),
    };
}
function validateTrackPreset(preset) {
    if (preset.ductAirflow != null && (preset.ductAirflow < 0.5 || preset.ductAirflow > 1)) {
        return "Duct airflow must be 0.5–1.0";
    }
    if (preset.wingBaseline != null && Math.abs(preset.wingBaseline) > 0.12) {
        return "Wing baseline must be within ±0.12";
    }
    if (preset.brakeBiasBaseline != null &&
        (preset.brakeBiasBaseline < 0.4 || preset.brakeBiasBaseline > 0.6)) {
        return "Brake bias must be 0.40–0.60";
    }
    if (preset.finalDriveRatio != null &&
        (preset.finalDriveRatio < 3.0 || preset.finalDriveRatio > 4.2)) {
        return "Final drive must be 3.0–4.2";
    }
    return null;
}
