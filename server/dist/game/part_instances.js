"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp01 = clamp01;
exports.newPartInstance = newPartInstance;
exports.effectivePerformanceStat = effectivePerformanceStat;
exports.advancePartFocus = advancePartFocus;
exports.bumpContextFamiliarity = bumpContextFamiliarity;
function clamp01(v) {
    return Math.min(1, Math.max(0, v));
}
function newPartInstance(catalogId, slot, category, source) {
    const basePerf = source === "inhouse" ? 0.55 : source === "licensed" ? 0.85 : 0.92;
    const baseRel = source === "shelved" ? 0.5 : 0.35;
    return {
        id: `part-${catalogId}-${Date.now()}`,
        catalogId,
        slot,
        category,
        source,
        performanceMaturity: basePerf,
        reliabilityMaturity: baseRel,
        partUnderstanding: source === "inhouse" ? 0.2 : 0.45,
        contextFamiliarity: {},
    };
}
function effectivePerformanceStat(catalogMax, inhouseBase, maturity) {
    return inhouseBase + (catalogMax - inhouseBase) * clamp01(maturity);
}
function advancePartFocus(part, focus, amount) {
    const d = Math.max(0, amount);
    const next = { ...part, contextFamiliarity: { ...part.contextFamiliarity } };
    if (focus === "performance") {
        next.performanceMaturity = clamp01(part.performanceMaturity + d);
    }
    else if (focus === "reliability") {
        next.reliabilityMaturity = clamp01(part.reliabilityMaturity + d);
    }
    else {
        next.partUnderstanding = clamp01(part.partUnderstanding + d);
    }
    return next;
}
function bumpContextFamiliarity(part, fleetCarId, trackId, amount) {
    const byCar = { ...part.contextFamiliarity };
    const trackMap = { ...(byCar[fleetCarId] ?? {}) };
    trackMap[trackId] = clamp01((trackMap[trackId] ?? 0) + amount);
    byCar[fleetCarId] = trackMap;
    return { ...part, contextFamiliarity: byCar };
}
