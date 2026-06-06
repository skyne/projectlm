"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiStrategyManager = void 0;
exports.buildAiPitCommand = buildAiPitCommand;
const PROFILES = {
    Hypercar: {
        fuelLowFraction: 0.28,
        fuelCriticalFraction: 0.12,
        tireWearThreshold: 0.72,
        targetStintSeconds: 2700,
        preferTyreStops: false,
    },
    LMP2: {
        fuelLowFraction: 0.27,
        fuelCriticalFraction: 0.11,
        tireWearThreshold: 0.74,
        targetStintSeconds: 3000,
        preferTyreStops: false,
    },
    LMGT3: {
        fuelLowFraction: 0.30,
        fuelCriticalFraction: 0.13,
        tireWearThreshold: 0.68,
        targetStintSeconds: 2100,
        preferTyreStops: true,
    },
};
const FALLBACK_TANK = {
    Hypercar: 90,
    LMP2: 75,
    LMGT3: 120,
};
const ENGINE_REPAIR_HEALTH = 75;
const TRAFFIC_WINDOW_SECONDS = 30;
function profile(classId) {
    return PROFILES[classId] ?? PROFILES.Hypercar;
}
function tank(snap) {
    return snap.fuelTankCapacity ?? FALLBACK_TANK[snap.classId] ?? 100;
}
function gapAheadSeconds(snap, snapshots) {
    const sameClass = snapshots
        .filter((s) => s.classId === snap.classId && !s.retired)
        .sort((a, b) => a.racePosition - b.racePosition);
    const idx = sameClass.findIndex((s) => s.entryId === snap.entryId);
    if (idx <= 0)
        return Number.POSITIVE_INFINITY;
    const ahead = sameClass[idx - 1];
    return Math.max(0, snap.gapToLeader - ahead.gapToLeader);
}
function wetness(ctx) {
    return ctx.trackWetness ?? 0;
}
function wantsWetTyres(ctx) {
    const w = wetness(ctx);
    return w >= 0.42 || (ctx.rainIntensity ?? 0) >= 0.55;
}
function wantsDryTyres(ctx) {
    return wetness(ctx) <= 0.12 && (ctx.rainIntensity ?? 0) < 0.1;
}
function pickCompound(snap, ctx, changeTyres) {
    if (!changeTyres)
        return "";
    if (wantsWetTyres(ctx))
        return "compound=wet|tires=all";
    if (wantsDryTyres(ctx) && snap.wetTyres) {
        return `compound=${(snap.tireCompound ?? "Medium").toLowerCase()}|tires=all`;
    }
    if (wantsDryTyres(ctx))
        return "compound=medium|tires=all";
    const p = profile(snap.classId);
    if (p.preferTyreStops)
        return "compound=medium|tires=all";
    return "compound=medium|tires=all";
}
function buildAiPitCommand(snap, snapshots, ctx) {
    if (snap.retired || snap.inPit || snap.pitQueued)
        return null;
    if (snap.lap < 2 || !Number.isFinite(snap.fuel))
        return null;
    const p = profile(snap.classId);
    const t = tank(snap);
    const w = wetness(ctx);
    const fuelLow = snap.fuel <= t * p.fuelLowFraction;
    const fuelCritical = snap.fuel <= t * p.fuelCriticalFraction;
    const tiresWorn = snap.tireWear >= p.tireWearThreshold;
    const wrongTyres = (wantsWetTyres(ctx) && !snap.wetTyres) ||
        (wantsDryTyres(ctx) && snap.wetTyres);
    const repair = (snap.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH;
    const stint = (snap.driverStintSeconds ?? 0) >= p.targetStintSeconds * 0.95;
    const trafficWindow = gapAheadSeconds(snap, snapshots) >= TRAFFIC_WINDOW_SECONDS;
    if (ctx.fcyActive || ctx.scActive) {
        if (!fuelCritical && !stint && !wrongTyres)
            return null;
    }
    if (!fuelCritical && !fuelLow && !tiresWorn && !repair && !stint && !wrongTyres)
        return null;
    if ((fuelLow || tiresWorn || repair || wrongTyres) &&
        !trafficWindow &&
        !fuelCritical &&
        !stint &&
        !wrongTyres)
        return null;
    const refuel = fuelLow || stint || fuelCritical;
    const changeTyres = tiresWorn || stint || wrongTyres || (p.preferTyreStops && refuel && snap.tireWear > 0.45);
    const parts = [
        "pit",
        `fuel=${refuel ? Math.max(0, Math.round(t - snap.fuel)) : 0}`,
    ];
    const compoundPart = pickCompound(snap, ctx, changeTyres);
    parts.push(compoundPart || (changeTyres ? "tires=all" : "tires="));
    if (repair)
        parts.push("repairs=engine");
    if (stint)
        parts.push("driver=swap");
    return parts.join("|");
}
class AiStrategyManager {
    constructor() {
        this.context = {
            raceTime: 0,
            targetDurationSeconds: 0,
        };
    }
    setContext(ctx) {
        this.context = { ...this.context, ...ctx };
    }
    tick(snapshots, playerEntryId, submit) {
        for (const snap of snapshots) {
            if (snap.entryId === playerEntryId || snap.retired || snap.inPit)
                continue;
            const cmd = buildAiPitCommand(snap, snapshots, this.context);
            if (cmd)
                submit(snap.entryId, cmd);
            const health = snap.engineHealth ?? 100;
            const coolant = snap.coolantTempC ?? 70;
            const underYellow = this.context.fcyActive || this.context.scActive;
            const raining = wetness(this.context) >= 0.35;
            if (!underYellow && !raining && (health <= 90 || coolant >= 100)) {
                submit(snap.entryId, "driver_mode=conserve");
            }
            else if (underYellow && health > 92) {
                submit(snap.entryId, "driver_mode=push");
            }
        }
    }
}
exports.AiStrategyManager = AiStrategyManager;
