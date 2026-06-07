"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRY_TYRE_THRESHOLD = exports.INTER_TYRE_THRESHOLD = exports.WET_TYRE_THRESHOLD = void 0;
exports.normalizeTyreTread = normalizeTyreTread;
exports.desiredTyreTread = desiredTyreTread;
exports.needsWeatherTyreSwap = needsWeatherTyreSwap;
exports.syncTyreTreadFromSnap = syncTyreTreadFromSnap;
exports.tyreTreadFromFlags = tyreTreadFromFlags;
exports.tyreGripScale = tyreGripScale;
exports.tyreCompoundId = tyreCompoundId;
exports.WET_TYRE_THRESHOLD = 0.38;
exports.INTER_TYRE_THRESHOLD = 0.15;
exports.DRY_TYRE_THRESHOLD = 0.12;
function normalizeTyreTread(raw) {
    const v = (raw ?? "slick").trim().toLowerCase();
    if (v === "wet" || v === "wets" || v === "full_wet")
        return "wet";
    if (v === "intermediate" || v === "inter" || v === "inters")
        return "intermediate";
    return "slick";
}
function desiredTyreTread(trackWetness) {
    if (trackWetness >= exports.WET_TYRE_THRESHOLD)
        return "wet";
    if (trackWetness >= exports.INTER_TYRE_THRESHOLD)
        return "intermediate";
    return "slick";
}
/** True when track conditions require a different tread than the car is on. */
function needsWeatherTyreSwap(current, trackWetness) {
    const target = desiredTyreTread(trackWetness);
    if (target === current)
        return false;
    return (trackWetness >= exports.INTER_TYRE_THRESHOLD ||
        (trackWetness < exports.DRY_TYRE_THRESHOLD && current !== "slick"));
}
function syncTyreTreadFromSnap(state, tireCompound, trackWetness) {
    if (tireCompound) {
        state.tyreTread = normalizeTyreTread(tireCompound);
    }
    else if (trackWetness < exports.DRY_TYRE_THRESHOLD) {
        state.tyreTread = "slick";
    }
}
function tyreTreadFromFlags(options) {
    if (options.tyreTread)
        return normalizeTyreTread(options.tyreTread);
    if (options.wetTyres)
        return "wet";
    if (options.intermediateTyres)
        return "intermediate";
    return "slick";
}
function trackSurfaceGripFactor(trackTempC) {
    if (trackTempC < 15)
        return Math.min(1, Math.max(0.88, 0.92 + (trackTempC - 15) * 0.004));
    if (trackTempC > 55)
        return Math.min(1, Math.max(0.88, 1 - (trackTempC - 55) * 0.004));
    const delta = Math.abs(trackTempC - 40);
    if (delta <= 5)
        return 1.02;
    if (delta <= 15)
        return 1.02 - (delta - 5) * 0.0015;
    return 0.98;
}
/** Mirrors C++ CompoundCrossoverGrip + weather wetness penalty. */
function tyreGripScale(tread, trackWetness, ambientTempC = 22, trackTempC = ambientTempC) {
    const wet = Math.min(1, Math.max(0, trackWetness));
    const tempDelta = ambientTempC - 26;
    let crossover = 1;
    if (tread === "wet") {
        const dryPenalty = wet < 0.2 ? 0.78 : 1;
        const wetBonus = wet < 0.35 ? 0.88 + wet * 0.35 : 0.95 + wet * 0.25;
        crossover = dryPenalty * wetBonus;
    }
    else if (tread === "intermediate") {
        if (wet < 0.1)
            crossover = 0.84;
        else if (wet < 0.22)
            crossover = 0.92 + (wet - 0.1) * 0.8;
        else if (wet < 0.5)
            crossover = 1.02;
        else if (wet < 0.65)
            crossover = 1.02 - (wet - 0.5) * 0.9;
        else
            crossover = 0.72;
    }
    else if (wet >= 0.45) {
        crossover = 0.64;
    }
    else if (wet >= 0.15) {
        crossover = 0.96;
    }
    else {
        crossover =
            Math.min(1.06, Math.max(0.88, 1 - Math.abs(tempDelta) * 0.008)) *
                trackSurfaceGripFactor(trackTempC);
    }
    const wetPenalty = 1 - wet * 0.22;
    const tempPenalty = ambientTempC > 34 ? 1 - Math.min(0.1, (ambientTempC - 34) * 0.005) : 1;
    return crossover * wetPenalty * tempPenalty;
}
function tyreCompoundId(compound, tread) {
    if (tread === "wet")
        return "wet";
    if (tread === "intermediate")
        return "intermediate";
    return compound;
}
