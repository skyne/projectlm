"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiStrategyManager = void 0;
exports.evaluateAiPitStop = evaluateAiPitStop;
const CLASS_PROFILES = {
    Hypercar: {
        fuelLowFraction: 0.28,
        fuelCriticalFraction: 0.12,
        tireWearThreshold: 0.72,
        targetStintSeconds: 2700,
        minLapsBetweenStops: 5,
    },
    LMP2: {
        fuelLowFraction: 0.27,
        fuelCriticalFraction: 0.11,
        tireWearThreshold: 0.74,
        targetStintSeconds: 3000,
        minLapsBetweenStops: 5,
    },
    LMGT3: {
        fuelLowFraction: 0.30,
        fuelCriticalFraction: 0.13,
        tireWearThreshold: 0.68,
        targetStintSeconds: 2100,
        minLapsBetweenStops: 4,
    },
};
const DEFAULT_PROFILE = {
    fuelLowFraction: 0.28,
    fuelCriticalFraction: 0.12,
    tireWearThreshold: 0.74,
    targetStintSeconds: 2700,
    minLapsBetweenStops: 4,
};
const FALLBACK_TANK_LITERS = {
    Hypercar: 90,
    LMGT3: 120,
    LMP2: 75,
};
const ENGINE_HEALTH_CONSERVE = 90;
const COOLANT_CONSERVE_C = 100;
const ENGINE_REPAIR_HEALTH = 75;
const DRIVER_STAMINA_THRESHOLD = 35;
const TRAFFIC_WINDOW_GAP_SEC = 22;
function profileFor(classId) {
    return CLASS_PROFILES[classId] ?? DEFAULT_PROFILE;
}
function tankLiters(snap) {
    if (typeof snap.fuelTankCapacity === "number" && snap.fuelTankCapacity > 0) {
        return snap.fuelTankCapacity;
    }
    return FALLBACK_TANK_LITERS[snap.classId] ?? 100;
}
function maxWheelWear(snap) {
    const wheels = [
        snap.tireWearFL,
        snap.tireWearFR,
        snap.tireWearRL,
        snap.tireWearRR,
        snap.tireWear,
    ].filter((v) => typeof v === "number" && Number.isFinite(v));
    return wheels.length ? Math.max(...wheels) : snap.tireWear;
}
function deflatedWheels(snap) {
    const td = snap.tyreDeflation ?? {};
    return Object.entries(td)
        .filter(([, v]) => v === "flat" || v === "soft")
        .map(([w]) => w.toUpperCase());
}
function needsLimpPit(snap) {
    const limp = snap.limpMode ?? "none";
    return limp !== "none" && limp !== "reduced_power";
}
function nextDriverIndex(snap) {
    const roster = snap.driverRoster ?? [];
    if (roster.length < 2)
        return -1;
    const active = snap.activeDriverIndex ?? 0;
    return (active + 1) % roster.length;
}
function pickCompound(stint, profile, plan) {
    if (plan?.compound)
        return plan.compound;
    if (stint === 0)
        return "medium";
    if (profile.targetStintSeconds <= 2200) {
        if (stint % 2 === 1)
            return "soft";
        return "hard";
    }
    if (stint % 3 === 1)
        return "soft";
    if (stint % 3 === 2)
        return "hard";
    return "medium";
}
function buildPitCommand(options) {
    const parts = ["pit", `fuel=${Math.max(0, Math.round(options.fuelLiters))}`];
    if (options.tyreWheels?.length) {
        parts.push(`compound=${options.compound}`, `tires=${options.tyreWheels.join(",")}`);
    }
    else if (options.changeTyres) {
        parts.push(`compound=${options.compound}`, "tires=all");
    }
    else {
        parts.push("tires=");
    }
    const repairs = [...(options.repairs ?? [])];
    if (options.repairEngine && !repairs.includes("engine"))
        repairs.push("engine");
    if (repairs.length)
        parts.push(`repairs=${repairs.join(",")}`);
    if (options.driverChange && options.driverIndex >= 0) {
        parts.push("driver_change=true", `driver_index=${options.driverIndex}`);
    }
    return parts.join("|");
}
function desiredDriverMode(snap, plan) {
    const health = snap.engineHealth ?? 100;
    const coolant = snap.coolantTempC ?? 70;
    if (health <= ENGINE_HEALTH_CONSERVE || coolant >= COOLANT_CONSERVE_C) {
        return "conserve";
    }
    if (plan?.driverMode)
        return plan.driverMode;
    return "normal";
}
function fuelLow(snap, profile, plan) {
    const tank = tankLiters(snap);
    const lowFrac = plan?.fuelStopFraction ?? profile.fuelLowFraction;
    return (snap.fuel <= tank * profile.fuelCriticalFraction ||
        snap.fuel <= tank * lowFrac);
}
function fuelCritical(snap, profile) {
    const tank = tankLiters(snap);
    return snap.fuel <= tank * profile.fuelCriticalFraction;
}
function needsRegulatoryDriverSwap(snap) {
    const rosterSize = snap.driverRoster?.length ?? 0;
    if (rosterSize < 2)
        return false;
    const maxStint = snap.maxDriverStintSeconds ?? 0;
    const stint = snap.driverStintSeconds ?? 0;
    if (maxStint > 0 && stint >= maxStint * 0.92)
        return true;
    const stamina = snap.driverStamina ?? 100;
    return stamina <= DRIVER_STAMINA_THRESHOLD;
}
function needsScheduledStop(snap, profile, plan) {
    const target = plan?.targetStintSeconds ?? profile.targetStintSeconds;
    const stint = snap.driverStintSeconds ?? 0;
    return stint >= target * 0.95;
}
function trafficWindowOpen(snap) {
    const gap = snap.gapToLeader;
    if (!Number.isFinite(gap))
        return true;
    return gap >= TRAFFIC_WINDOW_GAP_SEC || gap <= 0.5;
}
function evaluateAiPitStop(snap, state, ctx, plan) {
    void ctx;
    if (snap.retired || snap.inPit || snap.pitQueued)
        return null;
    if (snap.lap < 2)
        return null;
    if (!Number.isFinite(snap.fuel) || snap.fuel < 0)
        return null;
    const profile = profileFor(snap.classId);
    const tank = tankLiters(snap);
    const lowFuel = fuelLow(snap, profile, plan);
    const criticalFuel = fuelCritical(snap, profile);
    const tireWear = maxWheelWear(snap);
    const tiresWorn = tireWear >= profile.tireWearThreshold;
    const scheduledStop = needsScheduledStop(snap, profile, plan);
    const planDriverSwap = plan?.driverChangeNextStop === true &&
        scheduledStop &&
        (snap.driverRoster?.length ?? 0) >= 2;
    const needsDriver = needsRegulatoryDriverSwap(snap) || planDriverSwap;
    const repairEngine = (snap.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH;
    const flatWheels = deflatedWheels(snap);
    const limpStop = needsLimpPit(snap);
    const mustStop = criticalFuel ||
        lowFuel ||
        needsDriver ||
        tiresWorn ||
        flatWheels.length > 0 ||
        limpStop ||
        (scheduledStop && snap.fuel <= tank * 0.55) ||
        (repairEngine && (lowFuel || tiresWorn || scheduledStop || needsDriver));
    if (!mustStop)
        return null;
    const lapsSinceStop = snap.lap - state.lastPitLap;
    if (!criticalFuel &&
        !needsDriver &&
        lapsSinceStop < profile.minLapsBetweenStops &&
        state.pitsCompleted > 0) {
        return null;
    }
    if (!criticalFuel && !needsDriver && !trafficWindowOpen(snap)) {
        return null;
    }
    const fuelToAdd = lowFuel || scheduledStop ? Math.max(0, tank - snap.fuel) : 0;
    const changeTyres = tiresWorn || scheduledStop;
    const driverIndex = needsDriver ? nextDriverIndex(snap) : -1;
    const compound = state.tireCompound;
    const reasons = [];
    if (lowFuel || scheduledStop)
        reasons.push("fuel");
    if (changeTyres)
        reasons.push("tyres");
    if (needsDriver)
        reasons.push("driver");
    if (repairEngine)
        reasons.push("engine");
    if (scheduledStop && !lowFuel)
        reasons.push("stint");
    if (plan?.notes && scheduledStop)
        reasons.push("plan");
    return {
        entryId: snap.entryId,
        command: buildPitCommand({
            fuelLiters: fuelToAdd,
            changeTyres,
            compound,
            driverChange: needsDriver && driverIndex >= 0,
            driverIndex,
            repairEngine,
        }),
        reason: reasons.join("+"),
    };
}
class AiStrategyManager {
    constructor() {
        this.states = new Map();
    }
    reset() {
        this.states.clear();
    }
    stateFor(entryId) {
        let state = this.states.get(entryId);
        if (!state) {
            state = {
                pitsCompleted: 0,
                lastPitLap: 0,
                tireCompound: "medium",
                driverMode: "normal",
            };
            this.states.set(entryId, state);
        }
        return state;
    }
    tick(snapshots, managedEntryIds, ctx, submitCommand, getPlan) {
        const queued = [];
        const managed = managedEntryIds instanceof Set
            ? managedEntryIds
            : new Set(managedEntryIds);
        for (const snap of snapshots) {
            if (managed.has(snap.entryId))
                continue;
            if (snap.retired || snap.inPit)
                continue;
            const plan = getPlan?.(snap.entryId);
            const state = this.stateFor(snap.entryId);
            if (plan) {
                state.tireCompound = plan.compound;
            }
            const mode = desiredDriverMode(snap, plan);
            if (mode !== state.driverMode) {
                if (submitCommand(snap.entryId, `driver_mode=${mode}`)) {
                    state.driverMode = mode;
                }
            }
            const decision = evaluateAiPitStop(snap, state, ctx, plan);
            if (!decision)
                continue;
            if (submitCommand(decision.entryId, decision.command)) {
                state.lastPitLap = snap.lap;
                state.pitsCompleted += 1;
                state.tireCompound = pickCompound(state.pitsCompleted, profileFor(snap.classId), getPlan?.(snap.entryId));
                queued.push(decision);
            }
        }
        return queued;
    }
}
exports.AiStrategyManager = AiStrategyManager;
