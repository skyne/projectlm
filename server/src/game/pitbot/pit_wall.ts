/**
 * PitBot pit-wall logic — shared by server (opponent AI) and session-player (co-op).
 */
import type { CarSnapshot, WeekendSessionType } from "../../ws_protocol";
import {
  desiredTyreTread,
  INTER_TYRE_THRESHOLD,
  syncTyreTreadFromSnap,
  type TyreTread,
} from "../../tyre_grip";
import {
  planPitStop,
  tankCapacityFor,
  type PlannerSnap,
} from "./pit_planner";

const WING_HYPER = 0.03;
const WING_GT3 = 0.02;
const BIAS_HYPER = 0.01;
const BIAS_GT3 = 0.01;
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
  rivalPitAggression?: (teamName: string) => number;
}

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

function driverMode(s: PlannerSnap, wet: number, tread: TyreTread): string {
  const coolant = s.coolantTempC ?? 70;
  const health = s.engineHealth ?? 100;
  if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread === "wet") {
    return "driver_mode=conserve";
  }
  if (wet < INTER_TYRE_THRESHOLD) return "driver_mode=push";
  return "driver_mode=normal";
}

function hybridStrategy(
  s: PlannerSnap,
  wet: number,
  tread: TyreTread,
  phase: WeekendSessionType,
): string | null {
  if (!isHypercar(s)) return null;
  const coolant = s.coolantTempC ?? 70;
  const health = s.engineHealth ?? 100;
  if (coolant >= COOLANT_CONSERVE_C || health <= ENGINE_CONSERVE_HEALTH || tread !== "slick") {
    return "hybrid_strategy=balanced";
  }
  if (phase === "race" && wet < INTER_TYRE_THRESHOLD) return "hybrid_strategy=deploy";
  return "hybrid_strategy=balanced";
}

function setupWing(s: PlannerSnap): number {
  return isHypercar(s) ? WING_HYPER : WING_GT3;
}

function setupBias(s: PlannerSnap): number {
  return isHypercar(s) ? BIAS_HYPER : BIAS_GT3;
}

function byEntryId(a: PlannerSnap, b: PlannerSnap): number {
  return a.entryId.localeCompare(b.entryId);
}

/** Stagger setup pits within a team: hypercars first, then GT3. */
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
  const hypercars = teamSnaps.filter((s) => s.classId === "Hypercar");
  const gt3s = teamSnaps.filter((s) => s.classId === "LMGT3");

  if (snap.classId === "Hypercar") {
    const idx = hypercars.findIndex((s) => s.entryId === snap.entryId);
    if (idx <= 0) return true;
    const prev = hypercars[idx - 1];
    return carState.get(prev.entryId)?.setupDone ?? false;
  }

  const anyHyperSetup = hypercars.some((h) => carState.get(h.entryId)?.setupDone);
  if (hypercars.length > 0 && !anyHyperSetup) return false;

  const gt3Idx = gt3s.findIndex((s) => s.entryId === snap.entryId);
  if (gt3Idx <= 0) return true;
  const prevGt3 = gt3s[gt3Idx - 1];
  return carState.get(prevGt3.entryId)?.setupDone ?? false;
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
  st.fuelAtLastPit = tankCapacityFor(s);
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

/** Release cars from garage at session start (practice/qualifying). */
export function releaseFromGarage(
  snapshots: PlannerSnap[],
  entryIds: string[],
  carState: Map<string, CarPitState>,
  submitCommand: (entryId: string, command: string) => boolean,
): void {
  for (const entryId of entryIds) {
    const s = snapshots.find((x) => x.entryId === entryId);
    const st = carState.get(entryId);
    if (!s || !st || st.released || !s.inGarage) continue;
    if (trySubmit(submitCommand, entryId, "release")) st.released = true;
  }
}

/** Pre-race grid commands for tyre compound, tread, driver mode, hybrid. */
export function gridSetupCommands(
  snapshots: PlannerSnap[],
  entryIds: string[],
  wet: number,
): PitBotAction[] {
  const tread = desiredTyreTread(wet);
  const compound = tread === "slick" ? "soft" : "medium";
  const actions: PitBotAction[] = [];

  for (const entryId of entryIds) {
    const snap = snapshots.find((s) => s.entryId === entryId);
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
      actions.push({ entryId, command: "driver_mode=push" });
    }
    if (snap && isHypercar(snap)) {
      actions.push({
        entryId,
        command:
          tread === "slick" ? "hybrid_strategy=deploy" : "hybrid_strategy=balanced",
      });
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
    releaseFromGarage(snapshots, entryIds, carState, submitCommand);
  }

  for (const entryId of entryIds) {
    const s = snapshots.find((x) => x.entryId === entryId);
    if (!s || s.retired || s.inGarage || s.inPit || s.pitQueued) continue;
    const st = carState.get(entryId);
    if (!st) continue;

    syncTyreTreadFromSnap(st, s.tireCompound, ctx.wet);

    if (
      (s.bestLapTime ?? 0) > 0 &&
      (st.bestLap <= 0 || (s.bestLapTime ?? 0) < st.bestLap)
    ) {
      st.bestLap = s.bestLapTime ?? 0;
    }

    if (st.fuelAtLastPit <= 0) st.fuelAtLastPit = s.fuel;

    const sincePit = s.lap - st.lastPitLap;

    if (
      !st.setupDone &&
      timing &&
      !canRunSetupPit(s, snapshots, carState, ctx.phase, st)
    ) {
      const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase);
      if (hybrid) trySubmit(submitCommand, entryId, hybrid);
      trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread));
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
      },
      st.fuelAtLastPit,
    );

    if (plan?.pitNow) {
      const cmd = `pit|${plan.parts.join("|")}`;
      if (trySubmit(submitCommand, entryId, cmd)) {
        applyPitSuccess(s, st, ctx.wet, plan);
        actions.push({ entryId, command: cmd, label: plan.label });
        continue;
      }
    }

    const hybrid = hybridStrategy(s, ctx.wet, st.tyreTread, ctx.phase);
    if (hybrid) trySubmit(submitCommand, entryId, hybrid);
    trySubmit(submitCommand, entryId, driverMode(s, ctx.wet, st.tyreTread));
  }

  return actions;
}

export function fmtLap(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : `${s.toFixed(3)}s`;
}

export function classResults(
  snapshots: CarSnapshot[],
  teamNeedle: string,
): { hypercar: CarSnapshot[]; gt3: CarSnapshot[] } {
  const ours = snapshots.filter((s) => s.teamName.includes(teamNeedle));
  return {
    hypercar: ours.filter((s) => s.classId === "Hypercar"),
    gt3: ours.filter((s) => s.classId === "LMGT3"),
  };
}
