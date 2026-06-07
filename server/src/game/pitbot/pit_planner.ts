/**
 * Pit-stop planning: bundle fuel / tyres / driver / repairs into fewer visits.
 * Cost model mirrors viewer/src/utils/pitCommands.ts and src/sim/pit_stop.cpp.
 */
import type { CarSnapshot, WeekendSessionType } from "../../ws_protocol";
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

function fuelToAdd(s: PlannerSnap): number {
  return Math.max(1, Math.ceil(tankCapacity(s) - s.fuel));
}

const PIT_LANE_FRACTION = 0.06;
const PIT_LANE_SPEED_MS = 60 / 3.6;
const PIT_FUEL_SEC_PER_L = 0.038;
const PIT_TIRE_SEC = 2.8;
const PIT_REPAIR_ENGINE_SEC = 12;
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
}

export interface PitServiceFlags {
  fuel: boolean;
  tyres: boolean;
  driver: boolean;
  engine: boolean;
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

function driverSwapState(s: PlannerSnap): {
  needed: boolean;
  urgent: boolean;
  lapsUntil: number;
} {
  const roster = s.driverRoster ?? [];
  if (roster.length < 2) return { needed: false, urgent: false, lapsUntil: 99 };
  const maxStint = s.maxDriverStintSeconds ?? 0;
  const stint = s.driverStintSeconds ?? 0;
  const lapSec = lapTimeSec(s);
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
  const compound = tread === "slick" ? slickCompound(ctx.wet) : "medium";
  const parts: string[] = [];

  if (services.fuel) parts.push(`fuel=${fuelToAdd(s)}`);
  else parts.push("fuel=0");

  if (services.tyres) {
    parts.push(`compound=${compound}`, `tyre_tread=${tread}`, "tires=all");
  } else {
    parts.push("tires=");
  }

  if (services.engine) parts.push("repairs=engine");
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
  const profile = profileFor(s.classId);
  const { low: fuelLow, critical: fuelCrit } = scaledFuelThresholds(
    ctx.pitAggression,
    { low: profile.fuelLow, critical: profile.fuelCritical },
  );
  const fuelPct = s.fuel / tankCapacity(s);
  const weatherTyres = needsWeatherTyreSwap(ctx.tyreTread, ctx.wet);
  const driver =
    ctx.phase === "race"
      ? driverSwapState(s)
      : { needed: false, urgent: false, lapsUntil: 99 };
  const engine = (s.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH;
  const worn = tyresWorn(s);

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
    (ctx.wet >= WET_TYRE_THRESHOLD && weatherTyres);

  const anyNow = fuelNow || tyresNow || driverNow || engine;
  const bundleSoon =
    (fuelSoon && (driverSoon || tyresSoon)) ||
    (driverSoon && tyresSoon) ||
    (fuelSoon && driverSoon);

  if (!ctx.setupDone && !critical && ctx.phase !== "race") {
    if (ctx.sincePit < 1) return null;
    const services: PitServiceFlags = {
      setup: true,
      fuel: true,
      tyres: true,
      driver: false,
      engine: false,
    };
    const parts = buildParts(s, ctx, services, -1);
    return {
      pitNow: true,
      services,
      parts,
      label: "setup+fuel",
      estimateSec: estimateStopSec(s, services, fuelToAdd(s), 4),
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
    !bundleServices.engine
  ) {
    return null;
  }

  const fuelL = bundleServices.fuel ? fuelToAdd(s) : 0;
  const tyreN = bundleServices.tyres ? 4 : 0;
  const combinedSec = estimateStopSec(s, bundleServices, fuelL, tyreN);

  const splitStops = [
    bundleServices.fuel,
    bundleServices.tyres,
    bundleServices.driver,
    bundleServices.engine,
  ].filter(Boolean).length;

  let splitServiceOnly = 0;
  if (bundleServices.fuel) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: true, tyres: false, driver: false, engine: false, setup: false },
      fuelL,
      0,
    );
  }
  if (bundleServices.tyres) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: true, driver: false, engine: false, setup: false },
      0,
      4,
    );
  }
  if (bundleServices.driver) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: false, driver: true, engine: false, setup: false },
      0,
      0,
    );
  }
  if (bundleServices.engine) {
    splitServiceOnly += estimateServiceSec(
      s,
      { fuel: false, tyres: false, driver: false, engine: true, setup: false },
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

  const driverIndex = bundleServices.driver ? nextDriverIndex(s) : -1;
  const parts = buildParts(s, ctx, bundleServices, driverIndex);
  const label = serviceLabel(bundleServices);
  const est = estimateStopSec(
    s,
    bundleServices,
    bundleServices.fuel ? fuelToAdd(s) : 0,
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

export function fuelToAddFor(s: PlannerSnap): number {
  return fuelToAdd(s);
}
