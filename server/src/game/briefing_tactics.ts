import type {
  CarSessionBriefing,
  StaffMemberPayload,
  WeekendSessionType,
} from "../ws_protocol";
import type { AiStintPlan, StintCompound, StintDriverMode } from "../llm/stint_plan";
import type { PlannerSnap } from "./pitbot/pit_planner";
import { strategistSkillFromStaff, teammateYieldThresholdSec } from "./staff_briefing";

export type PracticeBriefingId =
  | "long_stint"
  | "setup_hunt"
  | "quali_sim"
  | "shake_down"
  | "tyre_test"
  | "fuel_calibration"
  | "weather_scout";

export type QualifyingBriefingId =
  | "pole_attack"
  | "front_row"
  | "best_effort"
  | "no_teammate_fight"
  | "teammate_support"
  | "single_flyer"
  | "race_prep"
  | "traffic_tow";

export type RaceBriefingId =
  | "hammer_time"
  | "conserve"
  | "hold_position"
  | "attack"
  | "defend"
  | "one_stop"
  | "two_stop"
  | "damage_limit"
  | "lift_and_coast"
  | "points_protect";

export type BriefingId = PracticeBriefingId | QualifyingBriefingId | RaceBriefingId;

export type ChassisBias = "quali" | "race" | "stable";
export type TeammatePolicy = "none" | "yield" | "support" | "priority";
export type BriefingPriority = "lead" | "support";

export interface BriefingTactics {
  briefingId: BriefingId;
  compound: StintCompound;
  driverMode: StintDriverMode;
  hybridStrategy: "deploy" | "balanced" | "harvest" | "hold";
  fuelStopFraction: number;
  targetStintSeconds: number;
  pitAggression: number;
  /** Explicit fuel target for practice/quali setup pits (liters in tank after stop). */
  pitFuelLiters?: number;
  setupFocus: boolean;
  qualiRuns: "single" | "multi";
  teammatePolicy: TeammatePolicy;
  priority?: BriefingPriority;
  gapHoldAheadSec?: number;
  gapHoldBehindSec?: number;
  chassisBias?: ChassisBias;
  conserveCar: boolean;
}

const CLASS_STINT: Record<string, { target: number; fuel: number; tank: number }> = {
  Hypercar: { target: 2700, fuel: 0.28, tank: 110 },
  LMP2: { target: 3000, fuel: 0.27, tank: 110 },
  LMGT3: { target: 2100, fuel: 0.30, tank: 90 },
};

function classDefaults(classId: string) {
  return CLASS_STINT[classId] ?? CLASS_STINT.Hypercar;
}

function qualiFuelLiters(classId: string, runs: "single" | "multi"): number {
  const tank = classDefaults(classId).tank;
  const laps = runs === "single" ? 4 : 6;
  return Math.min(tank, Math.max(12, Math.round(laps * 2.8)));
}

function baseTactics(
  briefingId: BriefingId,
  classId: string,
  overrides?: Partial<CarSessionBriefing>,
): BriefingTactics {
  const defs = classDefaults(classId);
  const priority = overrides?.priority;
  const teammatePolicy = overrides?.teammatePolicy ?? "none";

  const base: BriefingTactics = {
    briefingId,
    compound: "medium",
    driverMode: "normal",
    hybridStrategy: "balanced",
    fuelStopFraction: defs.fuel,
    targetStintSeconds: defs.target,
    pitAggression: 1,
    setupFocus: false,
    qualiRuns: "multi",
    teammatePolicy,
    priority,
    gapHoldAheadSec: overrides?.gapHoldSec?.ahead,
    gapHoldBehindSec: overrides?.gapHoldSec?.behind,
    conserveCar: false,
  };

  switch (briefingId) {
    case "long_stint":
      return {
        ...base,
        compound: "hard",
        driverMode: "normal",
        targetStintSeconds: defs.target + 600,
        pitFuelLiters: defs.tank,
        setupFocus: false,
      };
    case "setup_hunt":
      return {
        ...base,
        compound: "medium",
        setupFocus: true,
        pitFuelLiters: Math.min(defs.tank, 35),
        pitAggression: 1.1,
      };
    case "quali_sim":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        setupFocus: false,
        qualiRuns: "multi",
        pitFuelLiters: qualiFuelLiters(classId, "multi"),
        chassisBias: "quali",
      };
    case "shake_down":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        pitFuelLiters: Math.min(defs.tank, 45),
        chassisBias: "stable",
      };
    case "tyre_test":
      return {
        ...base,
        compound: "soft",
        setupFocus: false,
        pitFuelLiters: Math.min(defs.tank, 30),
        pitAggression: 1.2,
      };
    case "fuel_calibration":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        pitFuelLiters: defs.tank,
      };
    case "weather_scout":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        pitFuelLiters: Math.min(defs.tank, 50),
        pitAggression: 0.85,
      };
    case "pole_attack":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        qualiRuns: "multi",
        pitFuelLiters: qualiFuelLiters(classId, "multi"),
        pitAggression: 1.15,
        chassisBias: "quali",
      };
    case "front_row":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        qualiRuns: "multi",
        pitFuelLiters: qualiFuelLiters(classId, "multi") + 4,
        chassisBias: "quali",
      };
    case "best_effort":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        pitFuelLiters: qualiFuelLiters(classId, "multi"),
      };
    case "no_teammate_fight":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        teammatePolicy: teammatePolicy === "none" ? "yield" : teammatePolicy,
        pitFuelLiters: qualiFuelLiters(classId, "multi"),
      };
    case "teammate_support":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        teammatePolicy: "support",
        priority: priority ?? "support",
        qualiRuns: "single",
        pitFuelLiters: qualiFuelLiters(classId, "single"),
      };
    case "single_flyer":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        qualiRuns: "single",
        pitFuelLiters: qualiFuelLiters(classId, "single"),
        chassisBias: "quali",
      };
    case "race_prep":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        pitFuelLiters: Math.min(defs.tank, 55),
        chassisBias: "race",
      };
    case "traffic_tow":
      return {
        ...base,
        compound: "soft",
        driverMode: "normal",
        qualiRuns: "multi",
        pitFuelLiters: qualiFuelLiters(classId, "multi"),
      };
    case "hammer_time":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        fuelStopFraction: Math.max(0.15, defs.fuel - 0.06),
        pitAggression: 1.25,
      };
    case "conserve":
      return {
        ...base,
        compound: "medium",
        driverMode: "conserve",
        hybridStrategy: "harvest",
        fuelStopFraction: Math.min(0.35, defs.fuel + 0.08),
        pitAggression: 0.85,
        conserveCar: true,
      };
    case "hold_position":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        hybridStrategy: "balanced",
        gapHoldAheadSec: overrides?.gapHoldSec?.ahead ?? 1.5,
        gapHoldBehindSec: overrides?.gapHoldSec?.behind ?? 1.0,
        pitAggression: 0.95,
      };
    case "attack":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        hybridStrategy: "deploy",
        fuelStopFraction: Math.max(0.15, defs.fuel - 0.04),
        pitAggression: 1.2,
      };
    case "defend":
      return {
        ...base,
        compound: "medium",
        driverMode: "push",
        hybridStrategy: "deploy",
        gapHoldBehindSec: overrides?.gapHoldSec?.behind ?? 0.8,
        pitAggression: 1.05,
      };
    case "one_stop":
      return {
        ...base,
        compound: "hard",
        driverMode: "normal",
        targetStintSeconds: defs.target + 900,
        fuelStopFraction: Math.min(0.34, defs.fuel + 0.05),
        pitAggression: 0.9,
      };
    case "two_stop":
      return {
        ...base,
        compound: "soft",
        driverMode: "push",
        targetStintSeconds: Math.max(1200, defs.target - 600),
        fuelStopFraction: Math.max(0.18, defs.fuel - 0.05),
        pitAggression: 1.15,
      };
    case "damage_limit":
      return {
        ...base,
        compound: "medium",
        driverMode: "conserve",
        hybridStrategy: "hold",
        conserveCar: true,
        pitAggression: 0.75,
      };
    case "lift_and_coast":
      return {
        ...base,
        compound: "hard",
        driverMode: "conserve",
        hybridStrategy: "harvest",
        fuelStopFraction: 0.32,
        conserveCar: true,
        pitAggression: 0.7,
      };
    case "points_protect":
      return {
        ...base,
        compound: "medium",
        driverMode: "normal",
        hybridStrategy: "balanced",
        gapHoldAheadSec: 2,
        gapHoldBehindSec: 1.2,
        pitAggression: 0.88,
      };
    default:
      return base;
  }
}

export function defaultBriefingForSession(
  sessionType: WeekendSessionType,
): BriefingId {
  if (sessionType === "practice") return "setup_hunt";
  if (sessionType === "qualifying") return "best_effort";
  return "hold_position";
}

export function briefingIdsForSession(
  sessionType: WeekendSessionType,
): BriefingId[] {
  if (sessionType === "practice") {
    return [
      "long_stint",
      "setup_hunt",
      "quali_sim",
      "shake_down",
      "tyre_test",
      "fuel_calibration",
      "weather_scout",
    ];
  }
  if (sessionType === "qualifying") {
    return [
      "pole_attack",
      "front_row",
      "best_effort",
      "no_teammate_fight",
      "teammate_support",
      "single_flyer",
      "race_prep",
      "traffic_tow",
    ];
  }
  return [
    "hammer_time",
    "conserve",
    "hold_position",
    "attack",
    "defend",
    "one_stop",
    "two_stop",
    "damage_limit",
    "lift_and_coast",
    "points_protect",
  ];
}

export function resolveBriefingTactics(
  briefing: CarSessionBriefing | undefined,
  sessionType: WeekendSessionType,
  classId: string,
): BriefingTactics {
  const id = (briefing?.briefingId ?? defaultBriefingForSession(sessionType)) as BriefingId;
  return baseTactics(id, classId, briefing);
}

export function tacticsToStintPlan(
  entryId: string,
  stintNumber: number,
  tactics: BriefingTactics,
): AiStintPlan {
  return {
    entryId,
    stintNumber,
    compound: tactics.compound,
    driverMode: tactics.driverMode,
    targetStintSeconds: tactics.targetStintSeconds,
    fuelStopFraction: tactics.fuelStopFraction,
    driverChangeNextStop: false,
    notes: `Briefing: ${tactics.briefingId}`,
    offline: true,
    model: "briefing-tactics",
  };
}

export function effectiveStintPlan(
  entryId: string,
  stintNumber: number,
  tactics: BriefingTactics | undefined,
  aiPlan: AiStintPlan | undefined,
): AiStintPlan | undefined {
  if (tactics) return tacticsToStintPlan(entryId, stintNumber, tactics);
  return aiPlan;
}

/** Auto damage-limit when engine health is low. */
export function applyDamageLimitEscalation(
  tactics: BriefingTactics,
  snap: PlannerSnap,
): BriefingTactics {
  const health = snap.engineHealth ?? 100;
  if (health > 88 || tactics.briefingId === "damage_limit") return tactics;
  return baseTactics("damage_limit", snap.classId);
}

export function deriveAiBriefing(
  sessionType: WeekendSessionType,
  options: {
    gridIndex: number;
    teamSize: number;
    pitAggression?: number;
    classId: string;
  },
): CarSessionBriefing {
  const agg = options.pitAggression ?? 1;
  const isLead = options.gridIndex === 0;

  if (sessionType === "practice") {
    return { carId: "", briefingId: isLead ? "setup_hunt" : "long_stint" };
  }
  if (sessionType === "qualifying") {
    if (agg >= 1.1 && isLead) {
      return { carId: "", briefingId: "pole_attack" };
    }
    if (!isLead && options.teamSize > 1) {
      return {
        carId: "",
        briefingId: "no_teammate_fight",
        teammatePolicy: "yield",
        priority: "support",
      };
    }
    return { carId: "", briefingId: "best_effort" };
  }

  if (agg >= 1.15) {
    return { carId: "", briefingId: isLead ? "attack" : "hammer_time" };
  }
  if (agg <= 0.9) {
    return { carId: "", briefingId: "conserve" };
  }
  return { carId: "", briefingId: isLead ? "one_stop" : "two_stop" };
}

export function teammateOnTrackGapSec(
  snap: PlannerSnap,
  all: PlannerSnap[],
  yieldThresholdSec: number,
): boolean {
  if (yieldThresholdSec <= 0) return false;
  const sisters = all.filter(
    (s) =>
      s.entryId !== snap.entryId &&
      s.teamName === snap.teamName &&
      s.classId === snap.classId &&
      !s.retired &&
      !s.inGarage,
  );
  for (const other of sisters) {
    const gap = Math.abs((snap.gapToLeader ?? 0) - (other.gapToLeader ?? 0));
    if (gap <= yieldThresholdSec) return true;
  }
  return false;
}

export function holdPositionDriverMode(
  snap: PlannerSnap,
  all: PlannerSnap[],
  tactics: BriefingTactics,
): StintDriverMode {
  const targetAhead = tactics.gapHoldAheadSec ?? 1.5;
  const targetBehind = tactics.gapHoldBehindSec ?? 1.0;
  const classMates = all
    .filter((s) => s.classId === snap.classId && !s.retired)
    .sort((a, b) => (a.racePosition ?? 99) - (b.racePosition ?? 99));
  const idx = classMates.findIndex((s) => s.entryId === snap.entryId);
  const carAhead = idx > 0 ? classMates[idx - 1] : undefined;
  const carBehind = idx >= 0 && idx < classMates.length - 1 ? classMates[idx + 1] : undefined;

  const gapAhead =
    carAhead && snap.gapToLeader != null && carAhead.gapToLeader != null
      ? Math.max(0, snap.gapToLeader - carAhead.gapToLeader)
      : targetAhead;
  const gapBehind =
    carBehind && snap.gapToLeader != null && carBehind.gapToLeader != null
      ? Math.max(0, carBehind.gapToLeader - snap.gapToLeader)
      : targetBehind + 1;

  if (gapAhead > targetAhead + 0.5) return "push";
  if (gapBehind < targetBehind) return "push";
  if (gapAhead < targetAhead * 0.5) return "conserve";
  return "normal";
}

export function briefingPreviewLine(
  tactics: BriefingTactics,
  classId: string,
): string {
  const fuel =
    tactics.pitFuelLiters != null
      ? `~${tactics.pitFuelLiters}L`
      : `fuel stop ${Math.round(tactics.fuelStopFraction * 100)}%`;
  return `${tactics.compound} · ${tactics.driverMode} · ${fuel}`;
}

export function resolveBriefingDefaults(
  trackId: string,
  sessionType: WeekendSessionType,
  carId: string,
  defaults: Record<string, Record<string, Record<string, string>>> | undefined,
): string | undefined {
  return defaults?.[trackId]?.[sessionType]?.[carId];
}

export function mergeBriefingDefaults(
  existing: Record<string, Record<string, Record<string, string>>> | undefined,
  trackId: string,
  sessionType: WeekendSessionType,
  briefings: CarSessionBriefing[],
): Record<string, Record<string, Record<string, string>>> {
  const next = { ...(existing ?? {}) };
  const track = { ...(next[trackId] ?? {}) };
  const session: Record<string, string> = { ...(track[sessionType] ?? {}) };
  for (const b of briefings) {
    if (b.carId && b.briefingId) session[b.carId] = b.briefingId;
  }
  track[sessionType] = session;
  next[trackId] = track;
  return next;
}

export function strategistSkillForBriefing(
  staff: StaffMemberPayload[] | undefined,
  carId?: string,
): number {
  return strategistSkillFromStaff(staff, carId);
}

export { teammateYieldThresholdSec };
