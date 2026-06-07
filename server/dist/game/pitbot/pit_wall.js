"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETUP_CLASS_ORDER = void 0;
exports.initCarState = initCarState;
exports.releaseFromGarage = releaseFromGarage;
exports.gridSetupCommands = gridSetupCommands;
exports.tickPitBot = tickPitBot;
exports.fmtLap = fmtLap;
exports.teamResultsByClass = teamResultsByClass;
exports.sortedTeamClasses = sortedTeamClasses;
exports.classResults = classResults;
const tyre_grip_1 = require("../../tyre_grip");
const pit_planner_1 = require("./pit_planner");
const WING_HYPER = 0.03;
const WING_GT3 = 0.02;
const WING_LMP2 = 0.025;
const BIAS_HYPER = 0.01;
const BIAS_GT3 = 0.01;
const BIAS_LMP2 = 0.01;
const COOLANT_CONSERVE_C = 100;
const ENGINE_CONSERVE_HEALTH = 92;
function isTimingSession(phase) {
    return phase === "practice" || phase === "qualifying";
}
function isHypercar(s) {
    return s.classId === "Hypercar";
}
function isLmp2(s) {
    return s.classId === "LMP2";
}
/** Prototype / GT setup pit order within a multi-class team. */
exports.SETUP_CLASS_ORDER = ["Hypercar", "LMP2", "LMGT3"];
function driverMode(s, wet, tread, plan) {
    const coolant = s.coolantTempC ?? 70;
    const health = s.engineHealth ?? 100;
    if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread === "wet") {
        return "driver_mode=conserve";
    }
    if (plan?.driverMode === "conserve")
        return "driver_mode=conserve";
    if (plan?.driverMode === "normal")
        return "driver_mode=normal";
    if (plan?.driverMode === "push" && wet < tyre_grip_1.INTER_TYRE_THRESHOLD && tread === "slick") {
        return "driver_mode=push";
    }
    if (wet < tyre_grip_1.INTER_TYRE_THRESHOLD)
        return "driver_mode=push";
    return "driver_mode=normal";
}
function hybridStrategy(s, wet, tread, phase) {
    if (!isHypercar(s))
        return null;
    const coolant = s.coolantTempC ?? 70;
    const health = s.engineHealth ?? 100;
    if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread !== "slick") {
        return "hybrid_strategy=balanced";
    }
    if (phase === "race" && wet < tyre_grip_1.INTER_TYRE_THRESHOLD)
        return "hybrid_strategy=deploy";
    return "hybrid_strategy=balanced";
}
function setupWing(s) {
    if (isHypercar(s))
        return WING_HYPER;
    if (isLmp2(s))
        return WING_LMP2;
    return WING_GT3;
}
function setupBias(s) {
    if (isHypercar(s))
        return BIAS_HYPER;
    if (isLmp2(s))
        return BIAS_LMP2;
    return BIAS_GT3;
}
function byEntryId(a, b) {
    return a.entryId.localeCompare(b.entryId);
}
/** Stagger setup pits: Hypercar → LMP2 → LMGT3, then by entry within class. */
function canRunSetupPit(snap, allSnaps, carState, phase, st) {
    if (st.setupDone)
        return false;
    const setupLap = phase === "qualifying" ? 2 : 3;
    const sincePit = snap.lap - st.lastPitLap;
    if (snap.lap < setupLap || sincePit < 1)
        return false;
    const teamSnaps = allSnaps
        .filter((s) => s.teamName === snap.teamName)
        .sort(byEntryId);
    const classIdx = exports.SETUP_CLASS_ORDER.indexOf(snap.classId);
    if (classIdx >= 0) {
        for (let i = 0; i < classIdx; i++) {
            const priorClass = exports.SETUP_CLASS_ORDER[i];
            const priorCars = teamSnaps.filter((s) => s.classId === priorClass);
            if (priorCars.length === 0)
                continue;
            const anyDone = priorCars.some((c) => carState.get(c.entryId)?.setupDone ?? false);
            if (!anyDone)
                return false;
        }
    }
    const sameClass = teamSnaps
        .filter((s) => s.classId === snap.classId)
        .sort(byEntryId);
    const idx = sameClass.findIndex((s) => s.entryId === snap.entryId);
    if (idx <= 0)
        return true;
    const prev = sameClass[idx - 1];
    return carState.get(prev.entryId)?.setupDone ?? false;
}
function initCarState(entryIds, wet = 0, options) {
    const m = new Map();
    const startTread = (0, tyre_grip_1.desiredTyreTread)(wet);
    const minLap = options?.minLap ?? 0;
    const setupDone = minLap >= 3;
    for (const id of entryIds) {
        m.set(id, {
            bestLap: 0,
            setupDone,
            lastPitLap: options?.lastPitLap ?? 0,
            released: false,
            tyreTread: startTread,
            fuelAtLastPit: 0,
        });
    }
    return m;
}
function applyPitSuccess(s, st, wet, plan) {
    st.lastPitLap = s.lap;
    st.fuelAtLastPit = plan?.services.fuel ? (0, pit_planner_1.tankCapacityFor)(s) : s.fuel;
    if (plan?.services.setup)
        st.setupDone = true;
    if (plan?.services.tyres)
        st.tyreTread = (0, tyre_grip_1.desiredTyreTread)(wet);
}
function trySubmit(submitCommand, entryId, command) {
    return submitCommand(entryId, command);
}
/** Release cars from garage at session start (practice/qualifying). */
function releaseFromGarage(snapshots, entryIds, carState, submitCommand) {
    for (const entryId of entryIds) {
        const s = snapshots.find((x) => x.entryId === entryId);
        const st = carState.get(entryId);
        if (!s || !st || st.released || !s.inGarage)
            continue;
        if (trySubmit(submitCommand, entryId, "release"))
            st.released = true;
    }
}
/** Pre-race grid commands for tyre compound, tread, driver mode, hybrid. */
function gridSetupCommands(snapshots, entryIds, wet, getStintPlan) {
    const tread = (0, tyre_grip_1.desiredTyreTread)(wet);
    const actions = [];
    for (const entryId of entryIds) {
        const snap = snapshots.find((s) => s.entryId === entryId);
        const plan = getStintPlan?.(entryId);
        const compound = plan?.compound ?? (tread === "slick" ? "soft" : "medium");
        actions.push({
            entryId,
            command: `starting_compound=${compound}`,
        });
        actions.push({ entryId, command: `tyre_tread=${tread}` });
        if (tread === "wet") {
            actions.push({ entryId, command: "driver_mode=conserve" });
        }
        else if (tread === "intermediate") {
            actions.push({ entryId, command: "driver_mode=normal" });
        }
        else {
            actions.push({
                entryId,
                command: plan?.driverMode
                    ? `driver_mode=${plan.driverMode}`
                    : "driver_mode=push",
            });
        }
        if (snap && isHypercar(snap)) {
            actions.push({
                entryId,
                command: tread === "slick" ? "hybrid_strategy=deploy" : "hybrid_strategy=balanced",
            });
        }
    }
    return actions;
}
/** One tick of pit-wall logic for the given entries. */
function tickPitBot(snapshots, entryIds, carState, ctx, submitCommand) {
    const actions = [];
    const timing = isTimingSession(ctx.phase);
    if (timing) {
        releaseFromGarage(snapshots, entryIds, carState, submitCommand);
    }
    for (const entryId of entryIds) {
        const s = snapshots.find((x) => x.entryId === entryId);
        if (!s || s.retired || s.inGarage || s.inPit || s.pitQueued)
            continue;
        const st = carState.get(entryId);
        if (!st)
            continue;
        (0, tyre_grip_1.syncTyreTreadFromSnap)(st, s.tireCompound, ctx.wet);
        if ((s.bestLapTime ?? 0) > 0 &&
            (st.bestLap <= 0 || (s.bestLapTime ?? 0) < st.bestLap)) {
            st.bestLap = s.bestLapTime ?? 0;
        }
        if (st.fuelAtLastPit <= 0)
            st.fuelAtLastPit = s.fuel;
        const sincePit = s.lap - st.lastPitLap;
        if (!st.setupDone &&
            timing &&
            !canRunSetupPit(s, snapshots, carState, ctx.phase, st)) {
            const stintPlan = ctx.getStintPlan?.(entryId);
            const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase);
            if (hybrid)
                trySubmit(submitCommand, entryId, hybrid);
            trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread, stintPlan));
            continue;
        }
        const stintPlan = ctx.getStintPlan?.(entryId);
        const plan = (0, pit_planner_1.planPitStop)(s, {
            phase: ctx.phase,
            wet: ctx.wet,
            sincePit,
            setupDone: st.setupDone,
            tyreTread: st.tyreTread,
            setupWing: setupWing(s),
            setupBias: setupBias(s),
            pitAggression: ctx.rivalPitAggression?.(s.teamName) ?? 1,
            stintPlan,
        }, st.fuelAtLastPit);
        if (plan?.pitNow) {
            const cmd = `pit|${plan.parts.join("|")}`;
            if (trySubmit(submitCommand, entryId, cmd)) {
                applyPitSuccess(s, st, ctx.wet, plan);
                actions.push({ entryId, command: cmd, label: plan.label });
                continue;
            }
        }
        const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase);
        if (hybrid)
            trySubmit(submitCommand, entryId, hybrid);
        trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread, ctx.getStintPlan?.(entryId)));
    }
    return actions;
}
function fmtLap(sec) {
    if (!sec || sec <= 0)
        return "—";
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : `${s.toFixed(3)}s`;
}
function teamResultsByClass(snapshots, options = {}) {
    const list = Array.isArray(snapshots) ? snapshots : [];
    const entrySet = options.entryIds && options.entryIds.length > 0
        ? new Set(options.entryIds)
        : null;
    const needle = options.teamNeedle?.trim() ?? "";
    const ours = list.filter((s) => {
        if (entrySet)
            return entrySet.has(s.entryId);
        if (needle)
            return s.teamName.includes(needle);
        return false;
    });
    const byClass = {};
    for (const snap of ours) {
        const bucket = byClass[snap.classId] ?? [];
        bucket.push(snap);
        byClass[snap.classId] = bucket;
    }
    return byClass;
}
function sortedTeamClasses(byClass) {
    return Object.keys(byClass)
        .filter((cls) => byClass[cls].length > 0)
        .sort((a, b) => {
        const ia = exports.SETUP_CLASS_ORDER.indexOf(a);
        const ib = exports.SETUP_CLASS_ORDER.indexOf(b);
        const ra = ia >= 0 ? ia : 99;
        const rb = ib >= 0 ? ib : 99;
        if (ra !== rb)
            return ra - rb;
        return a.localeCompare(b);
    });
}
/** @deprecated Prefer teamResultsByClass — kept for callers expecting Hypercar/GT3 buckets. */
function classResults(snapshots, teamNeedle) {
    const byClass = teamResultsByClass(snapshots, { teamNeedle });
    return {
        hypercar: byClass.Hypercar ?? [],
        lmp2: byClass.LMP2 ?? [],
        gt3: byClass.LMGT3 ?? [],
    };
}
