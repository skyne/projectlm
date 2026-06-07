"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCarState = initCarState;
exports.releaseFromGarage = releaseFromGarage;
exports.gridSetupCommands = gridSetupCommands;
exports.tickPitBot = tickPitBot;
exports.fmtLap = fmtLap;
exports.classResults = classResults;
const tyre_grip_1 = require("../../tyre_grip");
const pit_planner_1 = require("./pit_planner");
const WING_HYPER = 0.03;
const WING_GT3 = 0.02;
const BIAS_HYPER = 0.01;
const BIAS_GT3 = 0.01;
const COOLANT_CONSERVE_C = 100;
const ENGINE_CONSERVE_HEALTH = 92;
function isTimingSession(phase) {
    return phase === "practice" || phase === "qualifying";
}
function isHypercar(s) {
    return s.classId === "Hypercar";
}
function driverMode(s, wet, tread) {
    const coolant = s.coolantTempC ?? 70;
    const health = s.engineHealth ?? 100;
    if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread === "wet") {
        return "driver_mode=conserve";
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
    return isHypercar(s) ? WING_HYPER : WING_GT3;
}
function setupBias(s) {
    return isHypercar(s) ? BIAS_HYPER : BIAS_GT3;
}
function byEntryId(a, b) {
    return a.entryId.localeCompare(b.entryId);
}
/** Stagger setup pits within a team: hypercars first, then GT3. */
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
    const hypercars = teamSnaps.filter((s) => s.classId === "Hypercar");
    const gt3s = teamSnaps.filter((s) => s.classId === "LMGT3");
    if (snap.classId === "Hypercar") {
        const idx = hypercars.findIndex((s) => s.entryId === snap.entryId);
        if (idx <= 0)
            return true;
        const prev = hypercars[idx - 1];
        return carState.get(prev.entryId)?.setupDone ?? false;
    }
    const anyHyperSetup = hypercars.some((h) => carState.get(h.entryId)?.setupDone);
    if (hypercars.length > 0 && !anyHyperSetup)
        return false;
    const gt3Idx = gt3s.findIndex((s) => s.entryId === snap.entryId);
    if (gt3Idx <= 0)
        return true;
    const prevGt3 = gt3s[gt3Idx - 1];
    return carState.get(prevGt3.entryId)?.setupDone ?? false;
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
function gridSetupCommands(snapshots, entryIds, wet) {
    const tread = (0, tyre_grip_1.desiredTyreTread)(wet);
    const compound = tread === "slick" ? "soft" : "medium";
    const actions = [];
    for (const entryId of entryIds) {
        const snap = snapshots.find((s) => s.entryId === entryId);
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
            actions.push({ entryId, command: "driver_mode=push" });
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
            const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase);
            if (hybrid)
                trySubmit(submitCommand, entryId, hybrid);
            trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread));
            continue;
        }
        const plan = (0, pit_planner_1.planPitStop)(s, {
            phase: ctx.phase,
            wet: ctx.wet,
            sincePit,
            setupDone: st.setupDone,
            tyreTread: st.tyreTread,
            setupWing: setupWing(s),
            setupBias: setupBias(s),
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
        trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread));
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
function classResults(snapshots, teamNeedle) {
    const ours = snapshots.filter((s) => s.teamName.includes(teamNeedle));
    return {
        hypercar: ours.filter((s) => s.classId === "Hypercar"),
        gt3: ours.filter((s) => s.classId === "LMGT3"),
    };
}
