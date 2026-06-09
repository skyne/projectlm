/**
 * Pit-stop planning: bundle fuel / tyres / driver / repairs into fewer visits.
 * Cost model mirrors viewer/src/utils/pitCommands.ts and src/sim/pit_stop.cpp.
 */
import type { CarSnapshot, RaceControlPayload, WeekendSessionType } from "../../ws_protocol";
import type { AiStintPlan } from "../../llm/stint_plan";
import type { BriefingTactics } from "../briefing_tactics";
import {
  desiredTyreTread,
  needsWeatherTyreSwap,
  WET_TYRE_THRESHOLD,
  type TyreTread,
} from "../../tyre_grip";

export type PlannerSnap = CarSnapshot & {
  fuelTankCapacity?: number;
  tireWear?: number;
  driverStintSeconds?: number;
  maxDriverStintSeconds?: number;
  driverStamina?: number;
  activeDriverIndex?: number;
  driverRoster?: Array<{ name: string; active?: boolean }>;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  lastLapTime?: number;
  bestLapTime?: number;
};

function tankCapacity(s: PlannerSnap): number {
  if (s.fuelTankCapacity != null && s.fuelTankCapacity > 0) {
    return s.fuelTankCapacity;
  }
  return profileFor(s.classId).defaultTank;
}

function fuelToAdd(s: PlannerSnap, tactics?: BriefingTactics): number {
  if (tactics?.pitFuelLiters != null) {
    const cap = tankCapacity(s);
    const target = Math.min(cap, Math.max(0, tactics.pitFuelLiters));
    const add = target - s.fuel;
    if (add <= 0) return 0;
    return Math.max(1, Math.ceil(add));
  }
  return Math.max(1, Math.ceil(tankCapacity(s) - s.fuel));
}

const PIT_LANE_FRACTION = 0.06;
const PIT_LANE_SPEED_MS = 60 / 3.6;
const PIT_FUEL_SEC_PER_L = 0.038;
const PIT_TIRE_SEC = 2.8;
const PIT_REPAIR_ENGINE_SEC = 12;
const PIT_REPAIR_BODY_SEC = 8;
const PIT_DRIVER_CHANGE_SEC = 15;
const PIT_SETUP_SEC = 6;
const DEFAULT_LAP_LENGTH_M = 13_600;

interface ClassFuelProfile {
  fuelLow: number;
  fuelCritical: number;
  tireWear: number;
  minLapsBetweenStops: number;
  defaultTank: number;
  burnPerLap: number;
}

/** Per-class stint thresholds — see docs/BALANCE_EQUALIZATION_PLAN.md Phase 0b. */
const CLASS_PROFILES: Record<string, ClassFuelProfile> = {
  Hypercar: {
    fuelLow: 0.30,
    fuelCritical: 0.14,
    tireWear: 0.72,
    minLapsBetweenStops: 3,
    defaultTank: 110,
    burnPerLap: 2.6,
  },
  LMP2: {
    fuelLow: 0.38,
    fuelCritical: 0.18,
    tireWear: 0.74,
    minLapsBetweenStops: 3,
    defaultTank: 110,
    burnPerLap: 2.0,
  },
  LMGT3: {
    fuelLow: 0.36,
    fuelCritical: 0.18,
    tireWear: 0.68,
    minLapsBetweenStops: 2,
    defaultTank: 100,
    burnPerLap: 2.3,
  },
};

const DEFAULT_PROFILE: ClassFuelProfile = CLASS_PROFILES.LMP2;

function profileFor(classId: string): ClassFuelProfile {
  return CLASS_PROFILES[classId] ?? DEFAULT_PROFILE;
}

const ENGINE_REPAIR_HEALTH = 78;
const DRIVER_STINT_SWAP_FRACTION = 0.88;
const DRIVER_STAMINA_THRESHOLD = 35;
/** Match src/sim/pit_stop.cpp red-flag emergency thresholds. */
export const EMERGENCY_FUEL_FRACTION = 0.18;
export const EMERGENCY_FUEL_TARGET_FRACTION = 0.25;
const EMERGENCY_REPAIR_HEALTH_THRESHOLD = 90;

/** Bundle a soon need if it hits within this many laps. */
const BUNDLE_LOOKAHEAD_LAPS = 5;

export interface PitPlannerContext {
  phase: WeekendSessionType;
  wet: number;
  sincePit: number;
  setupDone: boolean;
  tyreTread: TyreTread;
  setupWing?: number;
  setupBias?: number;
  /** >1 pits earlier; <1 stretches stints (rival season form). */
  pitAggression?: number;
  /** LLM/heuristic stint plan from AiStintGuide. */
  stintPlan?: AiStintPlan;
  briefingTactics?: BriefingTactics;
}

export interface PitServiceFlags {
  fuel: boolean;
  tyres: boolean;
  tyreWheels?: string[];
  driver: boolean;
  engine: boolean;
  body: boolean;
  setup: boolean;
}

export interface PitStopPlan {
  pitNow: boolean;
  services: PitServiceFlags;
  parts: string[];
  label: string;
  estimateSec: number;
  driverIndex: number;
}

function lapLengthM(_s: PlannerSnap): number {
  return DEFAULT_LAP_LENGTH_M;
}

function lapTimeSec(s: PlannerSnap): number {
  return s.lastLapTime || s.bestLapTime || (s.classId === "Hypercar" ? 230 : 310);
}

function pitLaneTravelSec(s: PlannerSnap): number {
  return (lapLengthM(s) * PIT_LANE_FRACTION) / PIT_LANE_SPEED_MS;
}

function estimateServiceSec(
  s: PlannerSnap,
  services: PitServiceFlags,
  fuelLiters: number,
  tyreCount: number,
): number {
  const mech = 0.94;
  const svc = s.serviceabilityFactor ?? 1;
  const dcf = s.driverChangeFactor ?? 1;
  const pitScale = 1 / Math.max(0.5, svc);
  const driverScale = 1 / Math.max(0.5, dcf);
  let t = 0;
  if (fuelLiters > 0) t += fuelLiters * PIT_FUEL_SEC_PER_L * mech * pitScale;
  t += tyreCount * PIT_TIRE_SEC * mech * pitScale;
  if (services.engine) t += PIT_REPAIR_ENGINE_SEC * mech * pitScale;
  if (services.body) t += PIT_REPAIR_BODY_SEC * 4 * mech * pitScale;
  if (services.driver) t += PIT_DRIVER_CHANGE_SEC * mech * driverScale;
  if (services.setup) t += PIT_SETUP_SEC * 0.96;
  return Math.max(5, t);
}

function estimateStopSec(
  s: PlannerSnap,
  services: PitServiceFlags,
  fuelLiters: number,
  tyreCount: number,
): number {
  return pitLaneTravelSec(s) + estimateServiceSec(s, services, fuelLiters, tyreCount);
}

function burnPerLap(s: PlannerSnap, sincePit: number, fuelAtLastPit: number): number {
  if (sincePit > 0 && fuelAtLastPit > s.fuel) {
    return (fuelAtLastPit - s.fuel) / sincePit;
  }
  return CLASS_PROFILES[s.classId]?.burnPerLap ?? DEFAULT_PROFILE.burnPerLap;
}

function lapsUntilFuelBelow(
  s: PlannerSnap,
  thresholdFrac: number,
  sincePit: number,
  fuelAtLastPit: number,
): number {
  const tank = tankCapacity(s);
  const target = tank * thresholdFrac;
  if (s.fuel <= target) return 0;
  const burn = burnPerLap(s, sincePit, fuelAtLastPit);
  if (burn <= 0) return 99;
  return Math.floor((s.fuel - target) / burn);
}

function driverSwapState(
  s: PlannerSnap,
  stintPlan?: AiStintPlan,
): {
  needed: boolean;
  urgent: boolean;
  lapsUntil: number;
} {
  const roster = s.driverRoster ?? [];
  if (roster.length < 2) return { needed: false, urgent: false, lapsUntil: 99 };
  const maxStint = s.maxDriverStintSeconds ?? 0;
  const stint = s.driverStintSeconds ?? 0;
  const lapSec = lapTimeSec(s);

  if (stintPlan && stintPlan.targetStintSeconds > 0) {
    const target = stintPlan.targetStintSeconds;
    if (stint >= target * 0.98) {
      return { needed: true, urgent: true, lapsUntil: 0 };
    }
    if (
      stintPlan.driverChangeNextStop &&
      stint >= target * 0.88
    ) {
      return { needed: true, urgent: false, lapsUntil: 0 };
    }
    if (stint >= target * 0.92) {
      return { needed: true, urgent: false, lapsUntil: 0 };
    }
    const remaining = target * 0.92 - stint;
    if (remaining > 0) {
      return {
        needed: false,
        urgent: false,
        lapsUntil: Math.ceil(remaining / lapSec),
      };
    }
  }

  if (maxStint > 0) {
    if (stint >= maxStint * 0.98) return { needed: true, urgent: true, lapsUntil: 0 };
    const swapAt = maxStint * DRIVER_STINT_SWAP_FRACTION;
    if (stint >= swapAt) return { needed: true, urgent: false, lapsUntil: 0 };
    const remaining = swapAt - stint;
    return { needed: false, urgent: false, lapsUntil: Math.ceil(remaining / lapSec) };
  }
  const stamina = s.driverStamina ?? 100;
  if (stamina <= DRIVER_STAMINA_THRESHOLD) {
    return { needed: true, urgent: stamina <= 20, lapsUntil: 0 };
  }
  return { needed: false, urgent: false, lapsUntil: 99 };
}

function deflatedWheels(s: PlannerSnap): string[] {
  const td = s.tyreDeflation ?? {};
  return Object.entries(td)
    .filter(([, v]) => v === "flat" || v === "soft")
    .map(([w]) => w.toUpperCase());
}

export function isRedFlagPhase(flagPhase?: string): boolean {
  return (flagPhase ?? "green").toLowerCase() === "red_flag";
}

/** True when the car needs immediate pit work (matches sim CarNeedsEmergencyPit). */
export function needsEmergencyPit(s: PlannerSnap): boolean {
  if (deflatedWheels(s).length > 0) return true;
  const limp = s.limpMode ?? "none";
  if (limp === "barely_driveable" || limp === "hybrid_only" || limp === "immobilized") {
    return true;
  }
  if (s.meatballFlag === true) return true;
  const tank =
    s.fuelTankCapacity != null && s.fuelTankCapacity > 0 ? s.fuelTankCapacity : 0;
  if (tank > 0 && s.fuel >= 0 && s.fuel / tank <= EMERGENCY_FUEL_FRACTION) return true;
  const hybridBudget = s.hybridBudgetMJ ?? 0;
  const hybridRemain = s.hybridDeployMJ ?? 0;
  if (
    hybridBudget > 0 &&
    hybridRemain >= 0 &&
    hybridRemain / hybridBudget <= EMERGENCY_FUEL_FRACTION
  ) {
    return true;
  }
  return false;
}

function emergencyFuelLiters(s: PlannerSnap): number {
  const tank = tankCapacity(s);
  if (tank <= 0 || s.fuel < 0) return 0;
  if (s.fuel / tank > EMERGENCY_FUEL_FRACTION) return 0;
  const target = tank * EMERGENCY_FUEL_TARGET_FRACTION;
  const maxAdd = Math.max(0, target - s.fuel);
  return maxAdd < 0.01 ? 0 : maxAdd;
}

function bodyNeedsEmergencyRepair(s: PlannerSnap): boolean {
  const ph = s.partHealth ?? {};
  for (const key of ["body_fl", "body_fr", "body_rl", "body_rr", "bodyFL", "bodyFR", "bodyRL", "bodyRR"]) {
    const health = ph[key];
    if (health != null && health < EMERGENCY_REPAIR_HEALTH_THRESHOLD) return true;
  }
  return false;
}

function emergencyRepairs(s: PlannerSnap): string[] {
  if (!canRepairThisSession(s)) return [];
  const repairs: string[] = [];
  if (s.meatballFlag) {
    if ((s.engineHealth ?? 100) < EMERGENCY_REPAIR_HEALTH_THRESHOLD) repairs.push("engine");
    if (needsLimpPit(s) || bodyNeedsEmergencyRepair(s)) repairs.push("body");
    return [...new Set(repairs)];
  }
  if ((s.engineHealth ?? 100) < EMERGENCY_REPAIR_HEALTH_THRESHOLD) repairs.push("engine");
  if (needsLimpPit(s) || bodyNeedsEmergencyRepair(s)) repairs.push("body");
  return [...new Set(repairs)];
}

function buildRedFlagEmergencyParts(
  s: PlannerSnap,
  wet: number,
  services: PitServiceFlags,
  fuelLiters: number,
): string[] {
  const tread = desiredTyreTread(wet);
  const compound = tread === "slick" ? slickCompound(wet) : "medium";
  const parts: string[] = [];
  if (fuelLiters > 0) parts.push(`fuel=${Math.max(1, Math.ceil(fuelLiters))}`);
  else parts.push("fuel=0");

  if (services.tyres && services.tyreWheels?.length) {
    parts.push(
      `compound=${compound}`,
      `tyre_tread=${tread}`,
      `tires=${services.tyreWheels.join(",")}`,
    );
  } else {
    parts.push("tires=");
  }

  const repairs = emergencyRepairs(s);
  if (repairs.length) parts.push(`repairs=${repairs.join(",")}`);
  return parts;
}

/** Emergency-only pit plan during red flag — no driver swap, setup, or strategy work. */
export function planRedFlagEmergencyPit(
  s: PlannerSnap,
  ctx: Pick<PitPlannerContext, "wet">,
): PitStopPlan | null {
  if (!needsEmergencyPit(s)) return null;

  const flatWheels = deflatedWheels(s);
  const fuelLiters = emergencyFuelLiters(s);
  const repairs = emergencyRepairs(s);

  const services: PitServiceFlags = {
    fuel: fuelLiters > 0,
    tyres: flatWheels.length > 0,
    tyreWheels: flatWheels,
    driver: false,
    engine: repairs.includes("engine"),
    body: repairs.includes("body"),
    setup: false,
  };

  if (
    !services.fuel &&
    !services.tyres &&
    !services.engine &&
    !services.body
  ) {
    return null;
  }

  const parts = buildRedFlagEmergencyParts(s, ctx.wet, services, fuelLiters);
  const tyreCount = services.tyres ? flatWheels.length : 0;
  return {
    pitNow: true,
    services,
    parts,
    label: `red flag ${serviceLabel(services)}`,
    estimateSec: estimateStopSec(s, services, fuelLiters, tyreCount),
    driverIndex: -1,
  };
}

function canRepairThisSession(s: PlannerSnap): boolean {
  if (s.physicallyRepairable === false) return false;
  if (s.sessionRepairable === false) return false;
  return true;
}

function needsLimpPit(s: PlannerSnap): boolean {
  if (!canRepairThisSession(s)) return false;
  const limp = s.limpMode ?? "none";
  return limp === "barely_driveable" || limp === "hybrid_only" || limp === "immobilized";
}

function tyresWorn(s: PlannerSnap): boolean {
  const wear = s.tireWear ?? 0;
  return wear >= profileFor(s.classId).tireWear;
}

function lapsUntilTyreWorn(s: PlannerSnap): number {
  const wear = s.tireWear ?? 0;
  const threshold = profileFor(s.classId).tireWear;
  if (wear >= threshold) return 0;
  const lap = Math.max(1, s.lap);
  const rate = wear / lap;
  if (rate <= 0) return 99;
  return Math.ceil((threshold - wear) / rate);
}

function nextDriverIndex(s: PlannerSnap): number {
  const roster = s.driverRoster ?? [];
  if (roster.length < 2) return -1;
  const active =
    s.activeDriverIndex ?? roster.findIndex((d: { active?: boolean }) => d.active);
  const idx = active >= 0 ? active : 0;
  return (idx + 1) % roster.length;
}

function slickCompound(wet: number): "soft" | "medium" | "hard" {
  if (wet > 0.2) return "medium";
  return "soft";
}

function buildParts(
  s: PlannerSnap,
  ctx: PitPlannerContext,
  services: PitServiceFlags,
  driverIndex: number,
): string[] {
  const tread = desiredTyreTread(ctx.wet);
  const compound =
    tread === "slick"
      ? ctx.stintPlan?.compound ?? slickCompound(ctx.wet)
      : "medium";
  const parts: string[] = [];

  if (services.fuel) {
    const liters = fuelToAdd(s, ctx.briefingTactics);
    if (liters > 0) parts.push(`fuel=${liters}`);
    else parts.push("fuel=0");
  }
  else parts.push("fuel=0");

  if (services.tyres) {
    const wheels = services.tyreWheels?.length ? services.tyreWheels.join(",") : "all";
    parts.push(`compound=${compound}`, `tyre_tread=${tread}`, `tires=${wheels}`);
  } else {
    parts.push("tires=");
  }

  const repairs: string[] = [];
  if (services.engine) repairs.push("engine");
  if (services.body) repairs.push("body");
  if (repairs.length) parts.push(`repairs=${repairs.join(",")}`);
  if (services.driver && driverIndex >= 0) {
    parts.push("driver_change=true", `driver_index=${driverIndex}`);
  }
  if (services.setup && ctx.setupWing != null && ctx.setupBias != null) {
    parts.push(`wing=${ctx.setupWing}`, `brake_bias=${ctx.setupBias}`);
  }
  return parts;
}

function serviceLabel(services: PitServiceFlags): string {
  const bits: string[] = [];
  if (services.setup) bits.push("setup");
  if (services.fuel) bits.push("fuel");
  if (services.tyres) bits.push("tyres");
  if (services.driver) bits.push("driver");
  if (services.engine) bits.push("engine");
  if (services.body) bits.push("body");
  return bits.join("+") || "stop";
}

/** Scale fuel pit windows — higher aggression pits earlier. */
export function scaledFuelThresholds(
  pitAggression = 1,
  base?: { low: number; critical: number },
): { low: number; critical: number } {
  const agg = Math.max(0.85, Math.min(1.15, pitAggression));
  const lowBase = base?.low ?? CLASS_PROFILES.Hypercar.fuelLow;
  const critBase = base?.critical ?? CLASS_PROFILES.Hypercar.fuelCritical;
  return {
    low: lowBase * agg,
    critical: critBase * agg,
  };
}

/** Decide bundled pit stop (or defer). */
export function planPitStop(
  s: PlannerSnap,
  ctx: PitPlannerContext,
  fuelAtLastPit: number,
): PitStopPlan | null {
  if (
    !canRepairThisSession(s) &&
    (s.limpMode === "barely_driveable" ||
      s.limpMode === "hybrid_only" ||
      s.limpMode === "immobilized")
  ) {
    return null;
  }

  const profile = profileFor(s.classId);
  const fuelBase = {
    low: ctx.stintPlan?.fuelStopFraction ?? profile.fuelLow,
    critical: ctx.stintPlan?.fuelStopFraction
      ? Math.min(profile.fuelCritical, ctx.stintPlan.fuelStopFraction * 0.55)
      : profile.fuelCritical,
  };
  const aggression =
    (ctx.pitAggression ?? 1) * (ctx.briefingTactics?.pitAggression ?? 1);
  const { low: fuelLow, critical: fuelCrit } = scaledFuelThresholds(
    aggression,
    fuelBase,
  );
  const fuelPct = s.fuel / tankCapacity(s);
  const weatherTyres = needsWeatherTyreSwap(ctx.tyreTread, ctx.wet);
  const driver =
    ctx.phase === "race"
      ? driverSwapState(s, ctx.stintPlan)
      : { needed: false, urgent: false, lapsUntil: 99 };
  const engine = (s.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH;
  const flatWheels = deflatedWheels(s);
  const limp = needsLimpPit(s);
  const worn = tyresWorn(s) || flatWheels.length > 0;

  // Lap 1: only emergency fuel / weather / engine — avoid routine bundling on out-lap.
  if (
    s.lap < 2 &&
    fuelPct >= fuelCrit &&
    !driver.urgent &&
    !engine &&
    !(ctx.wet >= WET_TYRE_THRESHOLD && weatherTyres)
  ) {
    return null;
  }

  const lapsFuelLow = lapsUntilFuelBelow(s, fuelLow, ctx.sincePit, fuelAtLastPit);
  const lapsFuelCrit = lapsUntilFuelBelow(
    s,
    fuelCrit,
    ctx.sincePit,
    fuelAtLastPit,
  );
  const lapsTyres = lapsUntilTyreWorn(s);

  const fuelNow = fuelPct < fuelLow;
  const fuelSoon = lapsFuelLow <= BUNDLE_LOOKAHEAD_LAPS;
  const tyresNow = weatherTyres || worn;
  const tyresSoon = weatherTyres || lapsTyres <= BUNDLE_LOOKAHEAD_LAPS;
  const driverNow = driver.needed;
  const driverSoon = driver.needed || driver.lapsUntil <= BUNDLE_LOOKAHEAD_LAPS;

  const critical =
    fuelPct < fuelCrit ||
    driver.urgent ||
    engine ||
    limp ||
    flatWheels.length > 0 ||
    (ctx.wet >= WET_TYRE_THRESHOLD && weatherTyres);

  const anyNow = fuelNow || tyresNow || driverNow || engine || limp;
  const bundleSoon =
    (fuelSoon && (driverSoon || tyresSoon)) ||
    (driverSoon && tyresSoon) ||
    (fuelSoon && driverSoon);

  if (!ctx.setupDone && !critical && ctx.phase !== "race") {
    if (ctx.sincePit < 1) return null;
    const wantSetup = ctx.briefingTactics?.setupFocus ?? true;
    const fuelL = fuelToAdd(s, ctx.briefingTactics);
    const services: PitServiceFlags = {
      setup: wantSetup,
      fuel: fuelL > 0,
      tyres: true,
      driver: false,
      engine: false,
      body: false,
    };
    const parts = buildParts(s, ctx, services, -1);
    return {
      pitNow: true,
      services,
      parts,
      label: wantSetup ? "setup+fuel" : "fuel+tyres",
      estimateSec: estimateStopSec(s, services, fuelL, 4),
      driverIndex: -1,
    };
  }

  if (!anyNow && !bundleSoon && !critical) return null;

  const minLaps =
    driver.urgent || fuelPct < fuelCrit ? 1 : profile.minLapsBetweenStops;
  if (ctx.sincePit < minLaps && !critical) return null;

  if (!critical && !driver.urgent && ctx.sincePit < profile.minLapsBetweenStops + 2) {
    const loneFuel = fuelNow && !driverSoon && !tyresSoon && !engine;
    const loneTyres = tyresNow && !fuelSoon && !driverSoon && !engine;
    const loneDriver = driverNow && !fuelSoon && !tyresSoon && !engine;
    // Never defer an active low-fuel stop to wait for tyre/driver bundling.
    if (loneTyres || loneDriver) {
      const waitFor = Math.min(
        tyresNow ? lapsTyres : 99,
        driverNow ? driver.lapsUntil : 99,
      );
      if (waitFor > 0 && waitFor <= BUNDLE_LOOKAHEAD_LAPS) return null;
    }
  }

  const lapSec = lapTimeSec(s);

  const bundleServices: PitServiceFlags = {
    setup: !ctx.setupDone && ctx.phase === "race",
    fuel: fuelNow || fuelSoon || fuelPct < fuelLow + 0.03,
    tyres: tyresNow || tyresSoon,
    driver: driverNow || driverSoon,
    engine,
    body: limp,
  };

  if (
    fuelNow &&
    !bundleServices.tyres &&
    !bundleServices.driver &&
    !bundleServices.engine &&
    driver.lapsUntil > BUNDLE_LOOKAHEAD_LAPS + 2 &&
    lapsTyres > BUNDLE_LOOKAHEAD_LAPS + 2
  ) {
    bundleServices.tyres = false;
    bundleServices.fuel = true;
  } else if (bundleSoon || critical) {
    bundleServices.fuel = bundleServices.fuel || fuelSoon;
    bundleServices.tyres = bundleServices.tyres || tyresSoon;
    bundleServices.driver = bundleServices.driver || driverSoon;
  }

  if (
    !bundleServices.fuel &&
    !bundleServices.tyres &&
    !bundleServices.driver &&
    !bundleServices.engine &&
    !bundleServices.body
  ) {
    return null;
  }

  const fuelL = bundleServices.fuel ? fuelToAdd(s, ctx.briefingTactics) : 0;
  const tyreN = bundleServices.tyres ? (bundleServices.tyreWheels?.length || 4) : 0;
  const combinedSec = estimateStopSec(s, bundleServices, fuelL, tyreN);

  const splitStops = [
    bundleServices.fuel,
    bundleServices.tyres,
    bundleServices.driver,
    bundleServices.engine,
    bundleServices.body,
  ].filter(Boolean).length;

  let splitServiceOnly = 0;
  if (bundleServices.fuel) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: true, tyres: false, driver: false, engine: false, body: false, setup: false },
      fuelL,
      0,
    );
  }
  if (bundleServices.tyres) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: true, driver: false, engine: false, body: false, setup: false },
      0,
      4,
    );
  }
  if (bundleServices.driver) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: false, driver: true, engine: false, body: false, setup: false },
      0,
      0,
    );
  }
  if (bundleServices.engine) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: false, driver: false, engine: true, body: false, setup: false },
      0,
      0,
    );
  }

  const travel = pitLaneTravelSec(s);
  const splitTotal =
    splitStops * travel + splitServiceOnly + Math.max(0, splitStops - 1) * lapSec;

  if (splitStops > 1 && combinedSec < splitTotal * 0.92) {
    // prefer bundle — already encoded in bundleServices
  } else if (splitStops > 1 && !critical && !bundleSoon) {
    if (engine) {
      bundleServices.fuel = false;
      bundleServices.tyres = false;
      bundleServices.driver = false;
    } else if (driver.urgent || driverNow) {
      bundleServices.fuel = fuelPct < fuelCrit + 0.07;
      bundleServices.tyres = weatherTyres;
      bundleServices.engine = false;
    } else if (fuelNow) {
      bundleServices.tyres = false;
      bundleServices.driver = false;
      bundleServices.engine = false;
    }
  }

  if (flatWheels.length) {
    bundleServices.tyres = true;
    bundleServices.tyreWheels = flatWheels;
  }
  const driverIndex = bundleServices.driver ? nextDriverIndex(s) : -1;
  const parts = buildParts(s, ctx, bundleServices, driverIndex);
  const label = serviceLabel(bundleServices);
  const est = estimateStopSec(
    s,
    bundleServices,
    bundleServices.fuel ? fuelToAdd(s, ctx.briefingTactics) : 0,
    bundleServices.tyres ? 4 : 0,
  );

  return {
    pitNow: true,
    services: bundleServices,
    parts,
    label:
      splitStops > 1
        ? `combined ${label} (~${Math.round(est)}s saves ~${Math.round(Math.max(0, splitTotal - est))}s)`
        : label,
    estimateSec: est,
    driverIndex,
  };
}

export function tankCapacityFor(s: PlannerSnap): number {
  return tankCapacity(s);
}

export function fuelToAddFor(s: PlannerSnap, tactics?: BriefingTactics): number {
  return fuelToAdd(s, tactics);
}

const DEFER_FLAG_PHASES = new Set(["fcy", "sc", "sc_in_lap", "slow_zone", "red_flag"]);

/** Defer routine pit stops under full-course or safety-car conditions. */
export function shouldDeferPitForRaceControl(
  rc: Pick<RaceControlPayload, "flagPhase" | "fcyActive" | "scActive"> | undefined,
): boolean {
  if (!rc) return false;
  if (rc.fcyActive || rc.scActive) return true;
  const phase = (rc.flagPhase ?? "green").toLowerCase();
  return DEFER_FLAG_PHASES.has(phase);
}

/** Car must enter the pits to serve a pending penalty before routine strategy. */
export function mustServePenalty(s: PlannerSnap): boolean {
  const penalty = s.pendingPenalty ?? "none";
  if (penalty === "none") return false;
  return (s.lapsToComply ?? 0) > 0 || penalty === "black";
}

/**
 * On-track fuel laps needed before serving drive-through / stop-and-go:
 * in-lap → penalty → out-lap → in-lap for service.
 */
export const PENALTY_SERVE_FUEL_BUFFER_LAPS = 2;

/** Flat tyres, limp mode, meatball, engine/body damage — service before penalty. */
export function hasSevereCarIssue(s: PlannerSnap): boolean {
  if (deflatedWheels(s).length > 0) return true;
  if (needsLimpPit(s)) return true;
  const limp = s.limpMode ?? "none";
  if (limp === "reduced_power") return true;
  if (s.meatballFlag === true) return true;
  if ((s.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH) return true;
  if (bodyNeedsEmergencyRepair(s)) return true;
  return false;
}

/**
 * True when a deferrable penalty (drive-through / stop-and-go) can be served now.
 * Defers when fuel is too low for in-penalty-out-service or severe damage needs fixing first.
 * Black-flag penalties always return true (serve immediately).
 */
export function shouldServeDeferrablePenaltyNow(
  s: PlannerSnap,
  sincePit: number,
  fuelAtLastPit: number,
): boolean {
  const penalty = s.pendingPenalty ?? "none";
  if (penalty === "none") return true;
  if (penalty === "black") return true;
  if (penalty !== "drive_through" && penalty !== "stop_go") return true;

  if (hasSevereCarIssue(s)) return false;

  const burn = burnPerLap(s, sincePit, fuelAtLastPit);
  if (burn <= 0) return true;

  return s.fuel >= burn * PENALTY_SERVE_FUEL_BUFFER_LAPS;
}
