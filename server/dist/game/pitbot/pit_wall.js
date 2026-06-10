"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETUP_CLASS_ORDER = exports.GARAGE_RELEASE_GAP_QUALIFYING_SEC = exports.GARAGE_RELEASE_GAP_PRACTICE_SEC = void 0;
exports.initCarState = initCarState;
exports.penaltyDisplayName = penaltyDisplayName;
exports.penaltyServeCommand = penaltyServeCommand;
exports.garageReleaseTimeSec = garageReleaseTimeSec;
exports.releaseFromGarage = releaseFromGarage;
exports.gridSetupCommands = gridSetupCommands;
exports.tickPitBot = tickPitBot;
exports.fmtLap = fmtLap;
exports.teamResultsByClass = teamResultsByClass;
exports.sortedTeamClasses = sortedTeamClasses;
exports.classResults = classResults;
const briefing_tactics_1 = require("../briefing_tactics");
const staff_briefing_1 = require("../staff_briefing");
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
/** Gap between successive cars leaving garage in practice (sim seconds). */
exports.GARAGE_RELEASE_GAP_PRACTICE_SEC = 3;
/** Gap between successive cars leaving garage in qualifying (sim seconds). */
exports.GARAGE_RELEASE_GAP_QUALIFYING_SEC = 2;
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
function driverMode(s, all, wet, tread, plan, tactics, strategistSkill = 50) {
    const coolant = s.coolantTempC ?? 70;
    const health = s.engineHealth ?? 100;
    if (coolant >= COOLANT_CONSERVE_C ||
        health <= ENGINE_CONSERVE_HEALTH ||
        tread === "wet" ||
        tactics?.conserveCar) {
        return "driver_mode=conserve";
    }
    let mode = plan?.driverMode ?? "normal";
    if (tactics) {
        if (tactics.briefingId === "hold_position" ||
            tactics.briefingId === "defend" ||
            tactics.briefingId === "points_protect") {
            mode = (0, briefing_tactics_1.holdPositionDriverMode)(s, all, tactics);
        }
        else {
            mode = tactics.driverMode;
        }
        const yieldThreshold = (0, staff_briefing_1.teammateYieldThresholdSec)(strategistSkill);
        if ((tactics.teammatePolicy === "yield" || tactics.briefingId === "no_teammate_fight") &&
            (0, briefing_tactics_1.teammateOnTrackGapSec)(s, all, yieldThreshold)) {
            mode = mode === "push" ? "normal" : mode;
        }
        if (tactics.teammatePolicy === "support" && tactics.priority === "support") {
            mode = "normal";
        }
    }
    else if (wet < tyre_grip_1.INTER_TYRE_THRESHOLD && tread === "slick" && !plan?.driverMode) {
        mode = "push";
    }
    if (mode === "conserve")
        return "driver_mode=conserve";
    if (mode === "push" && wet < tyre_grip_1.INTER_TYRE_THRESHOLD && tread === "slick") {
        return "driver_mode=push";
    }
    return "driver_mode=normal";
}
function hybridStrategy(s, wet, tread, phase, tactics) {
    if (!isHypercar(s))
        return null;
    const coolant = s.coolantTempC ?? 70;
    const health = s.engineHealth ?? 100;
    if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread !== "slick") {
        return "hybrid_strategy=balanced";
    }
    if (tactics?.hybridStrategy) {
        return `hybrid_strategy=${tactics.hybridStrategy}`;
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
    if (plan?.services.tyres) {
        st.tyreTread = (0, tyre_grip_1.desiredTyreTread)(wet);
        st.tyreFitLap = s.lap;
    }
}
function trySubmit(submitCommand, entryId, command) {
    return submitCommand(entryId, command);
}
function penaltyDisplayName(penalty) {
    switch (penalty) {
        case "drive_through":
            return "drive-through";
        case "stop_go":
            return "stop-and-go";
        case "black":
            return "black flag";
        default:
            return penalty.replace(/_/g, " ");
    }
}
function penaltyServeCommand(s) {
    const penalty = s.pendingPenalty ?? "none";
    if (penalty === "drive_through")
        return "pit|drive_through";
    if (penalty === "stop_go" || penalty === "black")
        return "pit|stop_go";
    return "pit|penalty";
}
function penaltyServeLabel(s) {
    return `Serve ${penaltyDisplayName(s.pendingPenalty ?? "penalty")}`;
}
function parseEntryGrid(entryId) {
    const match = /^entry-(\d+)$/.exec(entryId);
    return match ? parseInt(match[1], 10) : 999;
}
function gridSortKey(snap) {
    return parseEntryGrid(snap.entryId);
}
/** When this entry may leave garage during practice/qualifying (sim seconds). */
function garageReleaseTimeSec(phase, gridIndex) {
    const gap = phase === "qualifying"
        ? exports.GARAGE_RELEASE_GAP_QUALIFYING_SEC
        : exports.GARAGE_RELEASE_GAP_PRACTICE_SEC;
    return gridIndex * gap;
}
/**
 * Release cars from garage at session start (practice/qualifying), one at a time.
 * Server PitBot uses this for AI opponents; session-player uses it for managed team cars.
 */
function releaseFromGarage(snapshots, entryIds, carState, ctx, submitCommand) {
    const skill = ctx.strategistSkill ?? 50;
    const supportDelay = (0, staff_briefing_1.teammateSupportReleaseDelaySec)(skill);
    const raceTime = ctx.raceTimeSec ?? 0;
    const ordered = [...entryIds].sort((a, b) => {
        const sa = snapshots.find((s) => s.entryId === a);
        const sb = snapshots.find((s) => s.entryId === b);
        const ga = sa ? gridSortKey(sa) : parseEntryGrid(a);
        const gb = sb ? gridSortKey(sb) : parseEntryGrid(b);
        return ga - gb || a.localeCompare(b);
    });
    for (let gridIndex = 0; gridIndex < ordered.length; gridIndex++) {
        const entryId = ordered[gridIndex];
        const s = snapshots.find((x) => x.entryId === entryId);
        const st = carState.get(entryId);
        if (!s || !st || st.released || !s.inGarage)
            continue;
        const releaseAt = garageReleaseTimeSec(ctx.phase, gridIndex);
        if (raceTime < releaseAt)
            continue;
        const tactics = ctx.getBriefingTactics?.(entryId);
        if (tactics?.teammatePolicy === "support" &&
            tactics.priority === "support" &&
            raceTime < supportDelay) {
            continue;
        }
        if (trySubmit(submitCommand, entryId, "release")) {
            st.released = true;
            return;
        }
    }
}
/** Pre-race grid commands for tyre compound, tread, driver mode, hybrid. */
function gridSetupCommands(snapshots, entryIds, wet, getStintPlan, getBriefingTactics) {
    const tread = (0, tyre_grip_1.desiredTyreTread)(wet);
    const actions = [];
    for (const entryId of entryIds) {
        const snap = snapshots.find((s) => s.entryId === entryId);
        const tactics = getBriefingTactics?.(entryId);
        const plan = (0, briefing_tactics_1.effectiveStintPlan)(entryId, 1, tactics, getStintPlan?.(entryId));
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
            const hybrid = hybridStrategy(snap, wet, tread, "race", tactics);
            if (hybrid)
                actions.push({ entryId, command: hybrid });
        }
    }
    return actions;
}
/** One tick of pit-wall logic for the given entries. */
function tickPitBot(snapshots, entryIds, carState, ctx, submitCommand) {
    const actions = [];
    const timing = isTimingSession(ctx.phase);
    if (timing) {
        releaseFromGarage(snapshots, entryIds, carState, ctx, submitCommand);
    }
    const skill = ctx.strategistSkill ?? 50;
    for (const entryId of entryIds) {
        const s = snapshots.find((x) => x.entryId === entryId);
        if (!s || s.retired)
            continue;
        const st = carState.get(entryId);
        if (!st)
            continue;
        const redFlag = (0, pit_planner_1.isRedFlagPhase)(ctx.flagPhase);
        if (st.fuelAtLastPit <= 0)
            st.fuelAtLastPit = s.fuel;
        const sincePit = s.lap - st.lastPitLap;
        // Penalties before routine strategy — unless fuel/damage needs service first.
        if ((0, pit_planner_1.mustServePenalty)(s) &&
            !s.inGarage &&
            (0, pit_planner_1.shouldServeDeferrablePenaltyNow)(s, sincePit, st.fuelAtLastPit)) {
            const cmd = penaltyServeCommand(s);
            if (trySubmit(submitCommand, entryId, cmd)) {
                actions.push({
                    entryId,
                    command: cmd,
                    label: penaltyServeLabel(s),
                });
                continue;
            }
        }
        if (s.inGarage && !redFlag)
            continue;
        if (s.pitQueued && !s.inPit && !redFlag)
            continue;
        if (s.inPit && !redFlag && !(0, pit_planner_1.needsEmergencyPit)(s))
            continue;
        (0, tyre_grip_1.syncTyreTreadFromSnap)(st, s.tireCompound, ctx.wet);
        if ((s.bestLapTime ?? 0) > 0 &&
            (st.bestLap <= 0 || (s.bestLapTime ?? 0) < st.bestLap)) {
            st.bestLap = s.bestLapTime ?? 0;
        }
        const rawTactics = ctx.getBriefingTactics?.(entryId);
        const tactics = rawTactics
            ? (0, briefing_tactics_1.applyDamageLimitEscalation)(rawTactics, s)
            : undefined;
        const stintPlan = (0, briefing_tactics_1.effectiveStintPlan)(entryId, (s.pitCount ?? 0) + 1, tactics, ctx.getStintPlan?.(entryId));
        if (!st.setupDone &&
            timing &&
            !canRunSetupPit(s, snapshots, carState, ctx.phase, st)) {
            if (!redFlag) {
                const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
                if (hybrid)
                    trySubmit(submitCommand, entryId, hybrid);
                trySubmit(submitCommand, entryId, driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill));
            }
            continue;
        }
        if (redFlag) {
            if ((0, pit_planner_1.needsEmergencyPit)(s)) {
                const rfPlan = (0, pit_planner_1.planRedFlagEmergencyPit)(s, { wet: ctx.wet });
                if (rfPlan?.pitNow) {
                    const cmd = `pit|${rfPlan.parts.join("|")}`;
                    if (trySubmit(submitCommand, entryId, cmd)) {
                        actions.push({ entryId, command: cmd, label: rfPlan.label });
                    }
                }
            }
            continue;
        }
        const emergency = (0, pit_planner_1.needsEmergencyPit)(s);
        // Never defer once the fuel window is open: SC/FCY laps still burn fuel
        // and waiting for the emergency threshold strands cars on long laps.
        const tank = (0, pit_planner_1.tankCapacityFor)(s);
        const fuelWindowOpen = tank > 0 &&
            s.fuel / tank <= (0, pit_planner_1.burnScaledFuelBase)(s, sincePit, st.fuelAtLastPit).low;
        if (!emergency &&
            !fuelWindowOpen &&
            (0, pit_planner_1.shouldDeferPitForRaceControl)({
                flagPhase: ctx.flagPhase ?? "green",
                fcyActive: ctx.fcyActive ?? false,
                scActive: ctx.scActive ?? false,
            })) {
            const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
            if (hybrid)
                trySubmit(submitCommand, entryId, hybrid);
            trySubmit(submitCommand, entryId, driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill));
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
            pitAggression: ctx.rivalPitAggression?.(s.teamName) ?? 1,
            stintPlan,
            briefingTactics: tactics,
            lapsOnTyres: s.lap - (st.tyreFitLap ?? 0),
        }, st.fuelAtLastPit);
        if (plan?.pitNow) {
            const cmd = `pit|${plan.parts.join("|")}`;
            if (trySubmit(submitCommand, entryId, cmd)) {
                applyPitSuccess(s, st, ctx.wet, plan);
                const label = (0, pit_planner_1.mustServePenalty)(s) &&
                    !(0, pit_planner_1.shouldServeDeferrablePenaltyNow)(s, sincePit, st.fuelAtLastPit)
                    ? `${plan.label} before ${penaltyDisplayName(s.pendingPenalty ?? "penalty")}`
                    : plan.label;
                actions.push({ entryId, command: cmd, label });
                continue;
            }
        }
        const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
        if (hybrid)
            trySubmit(submitCommand, entryId, hybrid);
        trySubmit(submitCommand, entryId, driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill));
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
