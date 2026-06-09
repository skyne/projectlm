/**
 * PitBot pit-wall logic — shared by server (opponent AI) and session-player (co-op).
 */
import type { CarSnapshot, WeekendSessionType } from "../../ws_protocol";
import type { AiStintPlan } from "../../llm/stint_plan";
import {
  applyDamageLimitEscalation,
  effectiveStintPlan,
  holdPositionDriverMode,
  teammateOnTrackGapSec,
  type BriefingTactics,
} from "../briefing_tactics";
import { teammateSupportReleaseDelaySec, teammateYieldThresholdSec } from "../staff_briefing";
import {
  desiredTyreTread,
  INTER_TYRE_THRESHOLD,
  syncTyreTreadFromSnap,
  type TyreTread,
} from "../../tyre_grip";
import {
  isRedFlagPhase,
  shouldServeDeferrablePenaltyNow,
  mustServePenalty,
  needsEmergencyPit,
  planPitStop,
  planRedFlagEmergencyPit,
  shouldDeferPitForRaceControl,
  tankCapacityFor,
  type PlannerSnap,
} from "./pit_planner";

const WING_HYPER = 0.03;
const WING_GT3 = 0.02;
const WING_LMP2 = 0.025;
const BIAS_HYPER = 0.01;
const BIAS_GT3 = 0.01;
const BIAS_LMP2 = 0.01;
const COOLANT_CONSERVE_C = 100;
const ENGINE_CONSERVE_HEALTH = 92;

export interface CarPitState {
  bestLap: number;
  setupDone: boolean;
  lastPitLap: number;
  released: boolean;
  tyreTread: TyreTread;
  fuelAtLastPit: number;
}

export interface PitBotContext {
  phase: WeekendSessionType;
  wet: number;
  /** Sim race clock — required for staggered garage release in practice/qualifying. */
  raceTimeSec?: number;
  flagPhase?: string;
  fcyActive?: boolean;
  scActive?: boolean;
  rivalPitAggression?: (teamName: string) => number;
  getStintPlan?: (entryId: string) => AiStintPlan | undefined;
  getBriefingTactics?: (entryId: string) => BriefingTactics | undefined;
  strategistSkill?: number;
}

/** Gap between successive cars leaving garage in practice (sim seconds). */
export const GARAGE_RELEASE_GAP_PRACTICE_SEC = 3;
/** Gap between successive cars leaving garage in qualifying (sim seconds). */
export const GARAGE_RELEASE_GAP_QUALIFYING_SEC = 2;

export interface PitBotAction {
  entryId: string;
  command: string;
  label?: string;
}

function isTimingSession(phase: WeekendSessionType): boolean {
  return phase === "practice" || phase === "qualifying";
}

function isHypercar(s: PlannerSnap): boolean {
  return s.classId === "Hypercar";
}

function isLmp2(s: PlannerSnap): boolean {
  return s.classId === "LMP2";
}

/** Prototype / GT setup pit order within a multi-class team. */
export const SETUP_CLASS_ORDER = ["Hypercar", "LMP2", "LMGT3"] as const;

function driverMode(
  s: PlannerSnap,
  all: PlannerSnap[],
  wet: number,
  tread: TyreTread,
  plan?: AiStintPlan,
  tactics?: BriefingTactics,
  strategistSkill = 50,
): string {
  const coolant = s.coolantTempC ?? 70;
  const health = s.engineHealth ?? 100;
  if (
    coolant >= COOLANT_CONSERVE_C ||
    health <= ENGINE_CONSERVE_HEALTH ||
    tread === "wet" ||
    tactics?.conserveCar
  ) {
    return "driver_mode=conserve";
  }

  let mode: "push" | "normal" | "conserve" = plan?.driverMode ?? "normal";
  if (tactics) {
    if (
      tactics.briefingId === "hold_position" ||
      tactics.briefingId === "defend" ||
      tactics.briefingId === "points_protect"
    ) {
      mode = holdPositionDriverMode(s, all, tactics);
    } else {
      mode = tactics.driverMode;
    }
    const yieldThreshold = teammateYieldThresholdSec(strategistSkill);
    if (
      (tactics.teammatePolicy === "yield" || tactics.briefingId === "no_teammate_fight") &&
      teammateOnTrackGapSec(s, all, yieldThreshold)
    ) {
      mode = mode === "push" ? "normal" : mode;
    }
    if (tactics.teammatePolicy === "support" && tactics.priority === "support") {
      mode = "normal";
    }
  } else if (wet < INTER_TYRE_THRESHOLD && tread === "slick" && !plan?.driverMode) {
    mode = "push";
  }

  if (mode === "conserve") return "driver_mode=conserve";
  if (mode === "push" && wet < INTER_TYRE_THRESHOLD && tread === "slick") {
    return "driver_mode=push";
  }
  return "driver_mode=normal";
}

function hybridStrategy(
  s: PlannerSnap,
  wet: number,
  tread: TyreTread,
  phase: WeekendSessionType,
  tactics?: BriefingTactics,
): string | null {
  if (!isHypercar(s)) return null;
  const coolant = s.coolantTempC ?? 70;
  const health = s.engineHealth ?? 100;
  if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread !== "slick") {
    return "hybrid_strategy=balanced";
  }
  if (tactics?.hybridStrategy) {
    return `hybrid_strategy=${tactics.hybridStrategy}`;
  }
  if (phase === "race" && wet < INTER_TYRE_THRESHOLD) return "hybrid_strategy=deploy";
  return "hybrid_strategy=balanced";
}

function setupWing(s: PlannerSnap): number {
  if (isHypercar(s)) return WING_HYPER;
  if (isLmp2(s)) return WING_LMP2;
  return WING_GT3;
}

function setupBias(s: PlannerSnap): number {
  if (isHypercar(s)) return BIAS_HYPER;
  if (isLmp2(s)) return BIAS_LMP2;
  return BIAS_GT3;
}

function byEntryId(a: PlannerSnap, b: PlannerSnap): number {
  return a.entryId.localeCompare(b.entryId);
}

/** Stagger setup pits: Hypercar → LMP2 → LMGT3, then by entry within class. */
function canRunSetupPit(
  snap: PlannerSnap,
  allSnaps: PlannerSnap[],
  carState: Map<string, CarPitState>,
  phase: WeekendSessionType,
  st: CarPitState,
): boolean {
  if (st.setupDone) return false;
  const setupLap = phase === "qualifying" ? 2 : 3;
  const sincePit = snap.lap - st.lastPitLap;
  if (snap.lap < setupLap || sincePit < 1) return false;

  const teamSnaps = allSnaps
    .filter((s) => s.teamName === snap.teamName)
    .sort(byEntryId);

  const classIdx = SETUP_CLASS_ORDER.indexOf(
    snap.classId as (typeof SETUP_CLASS_ORDER)[number],
  );

  if (classIdx >= 0) {
    for (let i = 0; i < classIdx; i++) {
      const priorClass = SETUP_CLASS_ORDER[i];
      const priorCars = teamSnaps.filter((s) => s.classId === priorClass);
      if (priorCars.length === 0) continue;
      const anyDone = priorCars.some(
        (c) => carState.get(c.entryId)?.setupDone ?? false,
      );
      if (!anyDone) return false;
    }
  }

  const sameClass = teamSnaps
    .filter((s) => s.classId === snap.classId)
    .sort(byEntryId);
  const idx = sameClass.findIndex((s) => s.entryId === snap.entryId);
  if (idx <= 0) return true;
  const prev = sameClass[idx - 1];
  return carState.get(prev.entryId)?.setupDone ?? false;
}

export function initCarState(
  entryIds: string[],
  wet = 0,
  options?: { minLap?: number; lastPitLap?: number },
): Map<string, CarPitState> {
  const m = new Map<string, CarPitState>();
  const startTread = desiredTyreTread(wet);
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

function applyPitSuccess(
  s: PlannerSnap,
  st: CarPitState,
  wet: number,
  plan: ReturnType<typeof planPitStop>,
): void {
  st.lastPitLap = s.lap;
  st.fuelAtLastPit = plan?.services.fuel ? tankCapacityFor(s) : s.fuel;
  if (plan?.services.setup) st.setupDone = true;
  if (plan?.services.tyres) st.tyreTread = desiredTyreTread(wet);
}

function trySubmit(
  submitCommand: (entryId: string, command: string) => boolean,
  entryId: string,
  command: string,
): boolean {
  return submitCommand(entryId, command);
}

export function penaltyDisplayName(penalty: string): string {
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

export function penaltyServeCommand(s: PlannerSnap): string {
  const penalty = s.pendingPenalty ?? "none";
  if (penalty === "drive_through") return "pit|drive_through";
  if (penalty === "stop_go" || penalty === "black") return "pit|stop_go";
  return "pit|penalty";
}

function penaltyServeLabel(s: PlannerSnap): string {
  return `Serve ${penaltyDisplayName(s.pendingPenalty ?? "penalty")}`;
}

function parseEntryGrid(entryId: string): number {
  const match = /^entry-(\d+)$/.exec(entryId);
  return match ? parseInt(match[1], 10) : 999;
}

function gridSortKey(snap: PlannerSnap): number {
  return parseEntryGrid(snap.entryId);
}

/** When this entry may leave garage during practice/qualifying (sim seconds). */
export function garageReleaseTimeSec(
  phase: WeekendSessionType,
  gridIndex: number,
): number {
  const gap =
    phase === "qualifying"
      ? GARAGE_RELEASE_GAP_QUALIFYING_SEC
      : GARAGE_RELEASE_GAP_PRACTICE_SEC;
  return gridIndex * gap;
}

/**
 * Release cars from garage at session start (practice/qualifying), one at a time.
 * Server PitBot uses this for AI opponents; session-player uses it for managed team cars.
 */
export function releaseFromGarage(
  snapshots: PlannerSnap[],
  entryIds: string[],
  carState: Map<string, CarPitState>,
  ctx: Pick<
    PitBotContext,
    "phase" | "raceTimeSec" | "getBriefingTactics" | "strategistSkill"
  >,
  submitCommand: (entryId: string, command: string) => boolean,
): void {
  const skill = ctx.strategistSkill ?? 50;
  const supportDelay = teammateSupportReleaseDelaySec(skill);
  const raceTime = ctx.raceTimeSec ?? 0;
  const ordered = [...entryIds].sort((a, b) => {
    const sa = snapshots.find((s) => s.entryId === a);
    const sb = snapshots.find((s) => s.entryId === b);
    const ga = sa ? gridSortKey(sa) : parseEntryGrid(a);
    const gb = sb ? gridSortKey(sb) : parseEntryGrid(b);
    return ga - gb || a.localeCompare(b);
  });

  for (let gridIndex = 0; gridIndex < ordered.length; gridIndex++) {
    const entryId = ordered[gridIndex]!;
    const s = snapshots.find((x) => x.entryId === entryId);
    const st = carState.get(entryId);
    if (!s || !st || st.released || !s.inGarage) continue;

    const releaseAt = garageReleaseTimeSec(ctx.phase, gridIndex);
    if (raceTime < releaseAt) continue;

    const tactics = ctx.getBriefingTactics?.(entryId);
    if (
      tactics?.teammatePolicy === "support" &&
      tactics.priority === "support" &&
      raceTime < supportDelay
    ) {
      continue;
    }

    if (trySubmit(submitCommand, entryId, "release")) {
      st.released = true;
      return;
    }
  }
}

/** Pre-race grid commands for tyre compound, tread, driver mode, hybrid. */
export function gridSetupCommands(
  snapshots: PlannerSnap[],
  entryIds: string[],
  wet: number,
  getStintPlan?: (entryId: string) => AiStintPlan | undefined,
  getBriefingTactics?: (entryId: string) => BriefingTactics | undefined,
): PitBotAction[] {
  const tread = desiredTyreTread(wet);
  const actions: PitBotAction[] = [];

  for (const entryId of entryIds) {
    const snap = snapshots.find((s) => s.entryId === entryId);
    const tactics = getBriefingTactics?.(entryId);
    const plan = effectiveStintPlan(
      entryId,
      1,
      tactics,
      getStintPlan?.(entryId),
    );
    const compound = plan?.compound ?? (tread === "slick" ? "soft" : "medium");
    actions.push({
      entryId,
      command: `starting_compound=${compound}`,
    });
    actions.push({ entryId, command: `tyre_tread=${tread}` });
    if (tread === "wet") {
      actions.push({ entryId, command: "driver_mode=conserve" });
    } else if (tread === "intermediate") {
      actions.push({ entryId, command: "driver_mode=normal" });
    } else {
      actions.push({
        entryId,
        command: plan?.driverMode
          ? `driver_mode=${plan.driverMode}`
          : "driver_mode=push",
      });
    }
    if (snap && isHypercar(snap)) {
      const hybrid = hybridStrategy(snap, wet, tread, "race", tactics);
      if (hybrid) actions.push({ entryId, command: hybrid });
    }
  }
  return actions;
}

/** One tick of pit-wall logic for the given entries. */
export function tickPitBot(
  snapshots: PlannerSnap[],
  entryIds: string[],
  carState: Map<string, CarPitState>,
  ctx: PitBotContext,
  submitCommand: (entryId: string, command: string) => boolean,
): PitBotAction[] {
  const actions: PitBotAction[] = [];
  const timing = isTimingSession(ctx.phase);

  if (timing) {
    releaseFromGarage(snapshots, entryIds, carState, ctx, submitCommand);
  }

  const skill = ctx.strategistSkill ?? 50;

  for (const entryId of entryIds) {
    const s = snapshots.find((x) => x.entryId === entryId);
    if (!s || s.retired) continue;
    const st = carState.get(entryId);
    if (!st) continue;

    const redFlag = isRedFlagPhase(ctx.flagPhase);

    if (st.fuelAtLastPit <= 0) st.fuelAtLastPit = s.fuel;
    const sincePit = s.lap - st.lastPitLap;

    // Penalties before routine strategy — unless fuel/damage needs service first.
    if (
      mustServePenalty(s) &&
      !s.inGarage &&
      shouldServeDeferrablePenaltyNow(s, sincePit, st.fuelAtLastPit)
    ) {
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

    if (s.inGarage && !redFlag) continue;
    if (s.pitQueued && !s.inPit && !redFlag) continue;
    if (s.inPit && !redFlag && !needsEmergencyPit(s)) continue;

    syncTyreTreadFromSnap(st, s.tireCompound, ctx.wet);

    if (
      (s.bestLapTime ?? 0) > 0 &&
      (st.bestLap <= 0 || (s.bestLapTime ?? 0) < st.bestLap)
    ) {
      st.bestLap = s.bestLapTime ?? 0;
    }

    const rawTactics = ctx.getBriefingTactics?.(entryId);
    const tactics = rawTactics
      ? applyDamageLimitEscalation(rawTactics, s)
      : undefined;
    const stintPlan = effectiveStintPlan(
      entryId,
      (s.pitCount ?? 0) + 1,
      tactics,
      ctx.getStintPlan?.(entryId),
    );

    if (
      !st.setupDone &&
      timing &&
      !canRunSetupPit(s, snapshots, carState, ctx.phase, st)
    ) {
      if (!redFlag) {
        const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
        if (hybrid) trySubmit(submitCommand, entryId, hybrid);
        trySubmit(
          submitCommand,
          entryId,
          driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill),
        );
      }
      continue;
    }

    if (redFlag) {
      if (needsEmergencyPit(s)) {
        const rfPlan = planRedFlagEmergencyPit(s, { wet: ctx.wet });
        if (rfPlan?.pitNow) {
          const cmd = `pit|${rfPlan.parts.join("|")}`;
          if (trySubmit(submitCommand, entryId, cmd)) {
            actions.push({ entryId, command: cmd, label: rfPlan.label });
          }
        }
      }
      continue;
    }

    const emergency = needsEmergencyPit(s);
    if (
      !emergency &&
      shouldDeferPitForRaceControl({
        flagPhase: ctx.flagPhase ?? "green",
        fcyActive: ctx.fcyActive ?? false,
        scActive: ctx.scActive ?? false,
      })
    ) {
      const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
      if (hybrid) trySubmit(submitCommand, entryId, hybrid);
      trySubmit(
        submitCommand,
        entryId,
        driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill),
      );
      continue;
    }

    const plan = planPitStop(
      s,
      {
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
      },
      st.fuelAtLastPit,
    );

    if (plan?.pitNow) {
      const cmd = `pit|${plan.parts.join("|")}`;
      if (trySubmit(submitCommand, entryId, cmd)) {
        applyPitSuccess(s, st, ctx.wet, plan);
        const label =
          mustServePenalty(s) &&
          !shouldServeDeferrablePenaltyNow(s, sincePit, st.fuelAtLastPit)
            ? `${plan.label} before ${penaltyDisplayName(s.pendingPenalty ?? "penalty")}`
            : plan.label;
        actions.push({ entryId, command: cmd, label });
        continue;
      }
    }

    const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase, tactics);
    if (hybrid) trySubmit(submitCommand, entryId, hybrid);
    trySubmit(
      submitCommand,
      entryId,
      driverMode(s, snapshots, ctx.wet, st.tyreTread, stintPlan, tactics, skill),
    );
  }

  return actions;
}

export function fmtLap(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : `${s.toFixed(3)}s`;
}

export function teamResultsByClass(
  snapshots: CarSnapshot[] | unknown,
  options: { teamNeedle?: string; entryIds?: string[] } = {},
): Record<string, CarSnapshot[]> {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const entrySet =
    options.entryIds && options.entryIds.length > 0
      ? new Set(options.entryIds)
      : null;
  const needle = options.teamNeedle?.trim() ?? "";

  const ours = list.filter((s) => {
    if (entrySet) return entrySet.has(s.entryId);
    if (needle) return s.teamName.includes(needle);
    return false;
  });

  const byClass: Record<string, CarSnapshot[]> = {};
  for (const snap of ours) {
    const bucket = byClass[snap.classId] ?? [];
    bucket.push(snap);
    byClass[snap.classId] = bucket;
  }
  return byClass;
}

export function sortedTeamClasses(
  byClass: Record<string, CarSnapshot[]>,
): string[] {
  return Object.keys(byClass)
    .filter((cls) => byClass[cls].length > 0)
    .sort((a, b) => {
      const ia = SETUP_CLASS_ORDER.indexOf(a as (typeof SETUP_CLASS_ORDER)[number]);
      const ib = SETUP_CLASS_ORDER.indexOf(b as (typeof SETUP_CLASS_ORDER)[number]);
      const ra = ia >= 0 ? ia : 99;
      const rb = ib >= 0 ? ib : 99;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
}

/** @deprecated Prefer teamResultsByClass — kept for callers expecting Hypercar/GT3 buckets. */
export function classResults(
  snapshots: CarSnapshot[] | unknown,
  teamNeedle: string,
): { hypercar: CarSnapshot[]; gt3: CarSnapshot[]; lmp2: CarSnapshot[] } {
  const byClass = teamResultsByClass(snapshots, { teamNeedle });
  return {
    hypercar: byClass.Hypercar ?? [],
    lmp2: byClass.LMP2 ?? [],
    gt3: byClass.LMGT3 ?? [],
  };
}
