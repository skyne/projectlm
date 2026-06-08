import type { CarBuildPayload, PartOptionPayload } from "../ws/protocol";
import { normalizeExhaustType } from "./ev_outlet";

export interface WheelSetup {
  frontDiameterIn: number;
  rearDiameterIn: number;
  frontWidthMm: number;
  rearWidthMm: number;
}

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export interface WheelLimits {
  frontDiameter: SliderRange;
  rearDiameter: SliderRange;
  frontWidth: SliderRange;
  rearWidth: SliderRange;
}

export interface ResolvedWheelStats {
  frontDiameterM: number;
  rearDiameterM: number;
  frontWidthMm: number;
  rearWidthMm: number;
  gripFactor: number;
  wearFactor: number;
  dragCd: number;
  unsprungMass: number;
  mass: number;
  /** Per-axle contact grip vs package baseline (saturates / rolls off when too wide). */
  frontAxleGrip: number;
  rearAxleGrip: number;
  /** Front/rear balance — understeer & turn-in vs baseline ratio. */
  balanceFactor: number;
  /** Blended width grip used in sim (38% front / 62% rear). */
  widthGripBlend: number;
  /** Per-axle wear rate vs package baseline (sim applies per wheel). */
  frontAxleWear: number;
  rearAxleWear: number;
  /** Per-axle cornering heat build vs baseline. */
  frontAxleHeat: number;
  rearAxleHeat: number;
}

export interface ResolvedSuspensionStats {
  frontLayout: string;
  rearLayout: string;
  frontSpring: number;
  rearSpring: number;
  rideHeight: number;
  rollStiffness: number;
  aeroStability: number;
  unsprungFactor: number;
  mechanicalGrip: number;
  mass: number;
}

export interface SuspensionSetup {
  frontRideHeightMm: number;
  rearRideHeightMm: number;
  frontSpringNm: number;
  rearSpringNm: number;
  frontArbStiffness: number;
  rearArbStiffness: number;
  frontDamperBump: number;
  frontDamperRebound: number;
  rearDamperBump: number;
  rearDamperRebound: number;
}

export interface RideHeightLimits {
  min: number;
  max: number;
  step: number;
}

export interface SuspensionTuningPreview {
  rollStiffness: number;
  mechanicalGrip: number;
  rideHeightBalanceHint: string;
}

/** Per-class ride height slider bounds (mm). */
export const RIDE_HEIGHT_LIMITS: Record<string, RideHeightLimits> = {
  Hypercar: { min: 30, max: 55, step: 1 },
  LMP2: { min: 32, max: 58, step: 1 },
  LMGT3: { min: 38, max: 65, step: 1 },
};

export const SPRING_RATE_STEP_NM = 1000;
/** Spring rate sliders: ±25% from selected part baseline. */
export const SPRING_RATE_TOLERANCE = 0.25;

export const ARB_STIFFNESS_LIMITS: SliderRange = {
  min: 0.7,
  max: 1.3,
  step: 0.05,
};

export const DAMPER_LIMITS = { min: 1, max: 15 };
export const DEFAULT_DAMPER_CLICKS = 8;

const MM_PER_M = 1000;
const IN_TO_M = 0.0254;

const REAR_ONLY_SUSPENSION = new Set(["MultilinkRearHypercar"]);
const FRONT_ONLY_SUSPENSION = new Set(["MacPhersonStrutGT3", "MacPhersonStrutGT3Light"]);

/** Front axle layouts that cannot package a hub motor / e-axle. */
const FRONT_E_AXLE_INCOMPATIBLE = new Set([
  "MacPhersonStrutGT3",
  "MacPhersonStrutGT3Light",
  "MultilinkRearHypercar",
]);

const WHEEL_LIMITS: Record<string, WheelLimits> = {
  Hypercar: {
    frontDiameter: { min: 17, max: 19, step: 0.5 },
    rearDiameter: { min: 17, max: 19, step: 0.5 },
    frontWidth: { min: 290, max: 330, step: 5 },
    rearWidth: { min: 295, max: 355, step: 5 },
  },
  LMP2: {
    frontDiameter: { min: 17, max: 18, step: 0.5 },
    rearDiameter: { min: 17, max: 18, step: 0.5 },
    frontWidth: { min: 285, max: 310, step: 5 },
    rearWidth: { min: 290, max: 320, step: 5 },
  },
  LMGT3: {
    frontDiameter: { min: 18, max: 21, step: 0.5 },
    rearDiameter: { min: 18, max: 21, step: 0.5 },
    frontWidth: { min: 310, max: 340, step: 5 },
    rearWidth: { min: 315, max: 365, step: 5 },
  },
};

const DEFAULT_WHEEL_BY_CLASS: Record<string, WheelSetup> = {
  Hypercar: { frontDiameterIn: 18, rearDiameterIn: 18, frontWidthMm: 305, rearWidthMm: 310 },
  LMP2: { frontDiameterIn: 18, rearDiameterIn: 18, frontWidthMm: 300, rearWidthMm: 305 },
  LMGT3: { frontDiameterIn: 20, rearDiameterIn: 21, frontWidthMm: 325, rearWidthMm: 340 },
};

function num(stats: Record<string, number>, key: string, fallback: number): number {
  const v = stats[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function diameterInFromM(m: number): number {
  return Math.round((m * 1000) / 25.4);
}

export function wheelLimitsForClass(classId: string): WheelLimits {
  return WHEEL_LIMITS[classId] ?? WHEEL_LIMITS.Hypercar;
}

export function defaultWheelSetup(classId: string): WheelSetup {
  return { ...(DEFAULT_WHEEL_BY_CLASS[classId] ?? DEFAULT_WHEEL_BY_CLASS.Hypercar) };
}

export function wheelSetupFromPackage(
  packagePart: PartOptionPayload | undefined,
  classId: string,
): WheelSetup {
  if (!packagePart) return defaultWheelSetup(classId);
  const s = packagePart.stats;
  return {
    frontDiameterIn: diameterInFromM(num(s, "front_diameter_m", 0.457)),
    rearDiameterIn: diameterInFromM(num(s, "rear_diameter_m", 0.457)),
    frontWidthMm: num(s, "front_width_mm", 305),
    rearWidthMm: num(s, "rear_width_mm", 310),
  };
}

export function resolveWheelSetup(
  build: CarBuildPayload,
  classId: string,
  packagePart?: PartOptionPayload,
): WheelSetup {
  const fallback = packagePart
    ? wheelSetupFromPackage(packagePart, classId)
    : defaultWheelSetup(classId);
  return {
    frontDiameterIn: build.front_wheel_diameter_in ?? fallback.frontDiameterIn,
    rearDiameterIn: build.rear_wheel_diameter_in ?? fallback.rearDiameterIn,
    frontWidthMm: build.front_tire_width_mm ?? fallback.frontWidthMm,
    rearWidthMm: build.rear_tire_width_mm ?? fallback.rearWidthMm,
  };
}

export function clampWheelSetup(setup: WheelSetup, classId: string): WheelSetup {
  const limits = wheelLimitsForClass(classId);
  const clamp = (v: number, r: SliderRange) =>
    Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));
  return {
    frontDiameterIn: clamp(setup.frontDiameterIn, limits.frontDiameter),
    rearDiameterIn: clamp(setup.rearDiameterIn, limits.rearDiameter),
    frontWidthMm: clamp(setup.frontWidthMm, limits.frontWidth),
    rearWidthMm: clamp(setup.rearWidthMm, limits.rearWidth),
  };
}

export function resolveSuspensionLayouts(build: CarBuildPayload): {
  front: string;
  rear: string;
} {
  const legacy = build.suspension_layout;
  return {
    front: build.front_suspension_layout ?? legacy,
    rear: build.rear_suspension_layout ?? legacy,
  };
}

export function suspensionPart(
  parts: PartOptionPayload[] | undefined,
  layout: string,
): PartOptionPayload | undefined {
  return parts?.find((p) => p.partType === layout);
}

export function rideHeightLimitsForClass(classId: string): RideHeightLimits {
  return RIDE_HEIGHT_LIMITS[classId] ?? RIDE_HEIGHT_LIMITS.Hypercar;
}

export function springRateRange(baselineNm: number): SliderRange {
  const minRaw = baselineNm * (1 - SPRING_RATE_TOLERANCE);
  const maxRaw = baselineNm * (1 + SPRING_RATE_TOLERANCE);
  const step = SPRING_RATE_STEP_NM;
  return {
    min: Math.ceil(minRaw / step) * step,
    max: Math.floor(maxRaw / step) * step,
    step,
  };
}

function rideHeightMmFromPart(stats: Record<string, number>, fallbackMm: number): number {
  return Math.round(num(stats, "ride_height", fallbackMm / MM_PER_M) * MM_PER_M);
}

function suspensionBaselines(
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
): {
  frontRideHeightMm: number;
  rearRideHeightMm: number;
  frontSpringNm: number;
  rearSpringNm: number;
} {
  const { front, rear } = resolveSuspensionLayouts(build);
  const frontPart = suspensionPart(parts, front);
  const rearPart = suspensionPart(parts, rear);
  const fs = frontPart?.stats ?? {};
  const rs = rearPart?.stats ?? {};

  return {
    frontRideHeightMm: rideHeightMmFromPart(fs, 40),
    rearRideHeightMm: rideHeightMmFromPart(rs, 40),
    frontSpringNm: num(fs, "front_spring", 130000),
    rearSpringNm: num(rs, "rear_spring", 145000),
  };
}

export function resolveSuspensionSetup(
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
  _classId?: string,
): SuspensionSetup {
  const base = suspensionBaselines(build, parts);
  return {
    frontRideHeightMm: build.front_ride_height_mm ?? base.frontRideHeightMm,
    rearRideHeightMm: build.rear_ride_height_mm ?? base.rearRideHeightMm,
    frontSpringNm: build.front_spring_nm ?? base.frontSpringNm,
    rearSpringNm: build.rear_spring_nm ?? base.rearSpringNm,
    frontArbStiffness: build.front_arb_stiffness ?? 1,
    rearArbStiffness: build.rear_arb_stiffness ?? 1,
    frontDamperBump: build.front_damper_bump ?? DEFAULT_DAMPER_CLICKS,
    frontDamperRebound: build.front_damper_rebound ?? DEFAULT_DAMPER_CLICKS,
    rearDamperBump: build.rear_damper_bump ?? DEFAULT_DAMPER_CLICKS,
    rearDamperRebound: build.rear_damper_rebound ?? DEFAULT_DAMPER_CLICKS,
  };
}

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clampToRange(value: number, min: number, max: number, step: number): number {
  return snapToStep(Math.min(max, Math.max(min, value)), step);
}

export function clampSuspensionSetup(
  setup: SuspensionSetup,
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
  classId: string,
): SuspensionSetup {
  const base = suspensionBaselines(build, parts);
  const rh = rideHeightLimitsForClass(classId);
  const frontSpringRange = springRateRange(base.frontSpringNm);
  const rearSpringRange = springRateRange(base.rearSpringNm);

  const clampDamper = (v: number) =>
    Math.min(DAMPER_LIMITS.max, Math.max(DAMPER_LIMITS.min, Math.round(v)));

  return {
    frontRideHeightMm: clampToRange(setup.frontRideHeightMm, rh.min, rh.max, rh.step),
    rearRideHeightMm: clampToRange(setup.rearRideHeightMm, rh.min, rh.max, rh.step),
    frontSpringNm: clampToRange(
      setup.frontSpringNm,
      frontSpringRange.min,
      frontSpringRange.max,
      frontSpringRange.step,
    ),
    rearSpringNm: clampToRange(
      setup.rearSpringNm,
      rearSpringRange.min,
      rearSpringRange.max,
      rearSpringRange.step,
    ),
    frontArbStiffness:
      Math.round(
        clampToRange(
          setup.frontArbStiffness,
          ARB_STIFFNESS_LIMITS.min,
          ARB_STIFFNESS_LIMITS.max,
          ARB_STIFFNESS_LIMITS.step,
        ) * 100,
      ) / 100,
    rearArbStiffness:
      Math.round(
        clampToRange(
          setup.rearArbStiffness,
          ARB_STIFFNESS_LIMITS.min,
          ARB_STIFFNESS_LIMITS.max,
          ARB_STIFFNESS_LIMITS.step,
        ) * 100,
      ) / 100,
    frontDamperBump: clampDamper(setup.frontDamperBump),
    frontDamperRebound: clampDamper(setup.frontDamperRebound),
    rearDamperBump: clampDamper(setup.rearDamperBump),
    rearDamperRebound: clampDamper(setup.rearDamperRebound),
  };
}

export function suspensionSpringBaseline(
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
  axle: "front" | "rear",
): number {
  const base = suspensionBaselines(build, parts);
  return axle === "front" ? base.frontSpringNm : base.rearSpringNm;
}

export function computeSuspensionTuningStats(
  setup: SuspensionSetup,
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
): SuspensionTuningPreview {
  const { front, rear } = resolveSuspensionLayouts(build);
  const frontPart = suspensionPart(parts, front);
  const rearPart = suspensionPart(parts, rear);
  const fs = frontPart?.stats ?? {};
  const rs = rearPart?.stats ?? {};
  const base = suspensionBaselines(build, parts);

  const baseRoll = (num(fs, "roll_stiffness", 1) + num(rs, "roll_stiffness", 1)) / 2;
  const springRoll =
    (setup.frontSpringNm / base.frontSpringNm + setup.rearSpringNm / base.rearSpringNm) / 2;
  const arbAvg = (setup.frontArbStiffness + setup.rearArbStiffness) / 2;
  const rollStiffness = baseRoll * springRoll * arbAvg;

  const baseMech =
    (num(fs, "mechanical_grip", 1) + num(rs, "mechanical_grip", 1)) / 2;
  const damperAvg =
    (setup.frontDamperBump +
      setup.frontDamperRebound +
      setup.rearDamperBump +
      setup.rearDamperRebound) /
    4;
  const damperBalance = 1 - Math.abs(damperAvg - DEFAULT_DAMPER_CLICKS) * 0.008;
  const bumpReboundSpread =
    (Math.abs(setup.frontDamperBump - setup.frontDamperRebound) +
      Math.abs(setup.rearDamperBump - setup.rearDamperRebound)) /
    2;
  const mechanicalGrip = baseMech * damperBalance * (1 - bumpReboundSpread * 0.004);

  const rakeDelta = setup.frontRideHeightMm - setup.rearRideHeightMm;
  let rideHeightBalanceHint = "Balanced rake";
  if (rakeDelta >= 3) {
    rideHeightBalanceHint = "Front rake — understeer tendency";
  } else if (rakeDelta <= -3) {
    rideHeightBalanceHint = "Rear rake — oversteer tendency";
  }

  return { rollStiffness, mechanicalGrip, rideHeightBalanceHint };
}

export function resolveSuspensionStats(
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
): ResolvedSuspensionStats {
  const { front, rear } = resolveSuspensionLayouts(build);
  const frontPart = suspensionPart(parts, front);
  const rearPart = suspensionPart(parts, rear);
  const fs = frontPart?.stats ?? {};
  const rs = rearPart?.stats ?? {};
  const setup = resolveSuspensionSetup(build, parts);
  const tuning = computeSuspensionTuningStats(setup, build, parts);

  const baseRhMm =
    (num(fs, "ride_height", 0.04) + num(rs, "ride_height", 0.04)) * 0.5 * MM_PER_M;
  const tunedRhMm = (setup.frontRideHeightMm + setup.rearRideHeightMm) / 2;
  const baseAero = (num(fs, "aero_stability", 1) + num(rs, "aero_stability", 1)) / 2;
  const aeroStability = baseAero * (1 + (baseRhMm - tunedRhMm) * 0.003);
  const unsprungFactor = (num(fs, "unsprung_factor", 1) + num(rs, "unsprung_factor", 1)) / 2;
  const mass = ((frontPart?.mass ?? 14) + (rearPart?.mass ?? 14)) / 2;

  return {
    frontLayout: front,
    rearLayout: rear,
    frontSpring: setup.frontSpringNm,
    rearSpring: setup.rearSpringNm,
    rideHeight: tunedRhMm / MM_PER_M,
    rollStiffness: tuning.rollStiffness,
    aeroStability,
    unsprungFactor,
    mechanicalGrip: tuning.mechanicalGrip,
    mass,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Grip multiplier for one axle vs its package baseline. Narrow = less grip; wide = diminishing returns then rolloff. */
export function axleWidthGripFactor(widthMm: number, baselineMm: number): number {
  const t = (widthMm - baselineMm) / 100;
  if (t <= 0) return 1 + t * 0.08;
  const bonus = (0.05 * t) / (1 + 0.45 * t);
  const overload = 0.035 * t * t;
  return 1 + bonus - overload;
}

/** Cornering balance — wide front vs rear causes understeer; rear-heavy causes oversteer. */
export function tyreBalanceCorneringFactor(
  frontMm: number,
  rearMm: number,
  baseFrontMm: number,
  baseRearMm: number,
): number {
  const baseRatio = baseFrontMm / baseRearMm;
  const currentRatio = frontMm / rearMm;
  const ratioDelta = (currentRatio - baseRatio) / baseRatio;
  const understeer = Math.max(0, ratioDelta) * 0.42;
  const oversteer = Math.max(0, -ratioDelta) * 0.28;
  const frontExcess = Math.max(0, (frontMm - baseFrontMm) / 200);
  const turnInLoss = frontExcess * 0.18;
  return clamp(1 - understeer - oversteer - turnInLoss, 0.72, 1.04);
}

/** Wear rate multiplier for one axle vs package baseline width. */
export function axleWidthWearFactor(widthMm: number, baselineMm: number): number {
  const delta = (widthMm - baselineMm) / 200;
  return 1 + delta * 0.08 + Math.max(0, -delta) * 0.045;
}

/** Cornering heat build multiplier for one axle vs baseline width. */
export function axleWidthHeatFactor(widthMm: number, baselineMm: number): number {
  const delta = (widthMm - baselineMm) / 200;
  return 1 + Math.max(0, delta) * 0.16 + Math.max(0, -delta) * 0.05;
}

function axleDiameterThermalMassFactor(diaDelta: number): number {
  return Math.min(1.1, Math.max(0.88, 1 + diaDelta * 0.04));
}

export function computeWheelStats(
  setup: WheelSetup,
  packagePart: PartOptionPayload | undefined,
  classId: string,
): ResolvedWheelStats {
  const base = packagePart
    ? wheelSetupFromPackage(packagePart, classId)
    : defaultWheelSetup(classId);
  const s = packagePart?.stats ?? {};
  const baseGrip = num(s, "grip_factor", 1);
  const baseWear = num(s, "wear_factor", 1);
  const baseDrag = num(s, "drag_cd", 0.012);
  const baseUnsprung = num(s, "unsprung_mass", 8);
  const baseMass = packagePart?.mass ?? 22;

  const frontWidthDelta =
    (setup.frontWidthMm - base.frontWidthMm) / 200;
  const rearWidthDelta = (setup.rearWidthMm - base.rearWidthMm) / 200;
  const frontDiaDelta =
    (setup.frontDiameterIn - base.frontDiameterIn) / 4;
  const rearDiaDelta = (setup.rearDiameterIn - base.rearDiameterIn) / 4;

  const gripFactor = baseGrip;
  const frontAxleGrip = axleWidthGripFactor(setup.frontWidthMm, base.frontWidthMm);
  const rearAxleGrip = axleWidthGripFactor(setup.rearWidthMm, base.rearWidthMm);
  const widthGripBlend = 0.38 * frontAxleGrip + 0.62 * rearAxleGrip;
  const balanceFactor = tyreBalanceCorneringFactor(
    setup.frontWidthMm,
    setup.rearWidthMm,
    base.frontWidthMm,
    base.rearWidthMm,
  );

  const totalWidthDelta = Math.max(0, frontWidthDelta) + Math.max(0, rearWidthDelta);
  const wearFactor = baseWear;
  const frontAxleWear = axleWidthWearFactor(setup.frontWidthMm, base.frontWidthMm);
  const rearAxleWear = axleWidthWearFactor(setup.rearWidthMm, base.rearWidthMm);
  const frontThermalMass = axleDiameterThermalMassFactor(frontDiaDelta);
  const rearThermalMass = axleDiameterThermalMassFactor(rearDiaDelta);
  const frontAxleHeat =
    axleWidthHeatFactor(setup.frontWidthMm, base.frontWidthMm) / frontThermalMass;
  const rearAxleHeat =
    axleWidthHeatFactor(setup.rearWidthMm, base.rearWidthMm) / rearThermalMass;
  const dragCd =
    baseDrag +
    Math.max(0, frontWidthDelta) * 0.028 +
    Math.max(0, rearWidthDelta) * 0.012 +
    totalWidthDelta * 0.015 +
    frontDiaDelta * 0.0025 +
    rearDiaDelta * 0.0015;
  const unsprungMass =
    baseUnsprung *
    (1 +
      (frontDiaDelta + rearDiaDelta) * 0.04 +
      (frontWidthDelta + rearWidthDelta) * 0.035);
  const mass =
    baseMass +
    (frontWidthDelta + rearWidthDelta) * 2.2 +
    (frontDiaDelta + rearDiaDelta) * 1.5;

  return {
    frontDiameterM: setup.frontDiameterIn * IN_TO_M,
    rearDiameterM: setup.rearDiameterIn * IN_TO_M,
    frontWidthMm: setup.frontWidthMm,
    rearWidthMm: setup.rearWidthMm,
    gripFactor,
    wearFactor,
    dragCd,
    unsprungMass,
    mass,
    frontAxleGrip,
    rearAxleGrip,
    balanceFactor,
    widthGripBlend,
    frontAxleWear,
    rearAxleWear,
    frontAxleHeat,
    rearAxleHeat,
  };
}

export function isSuspensionLegalForAxle(
  layout: string,
  axle: "front" | "rear",
): boolean {
  if (axle === "front" && REAR_ONLY_SUSPENSION.has(layout)) return false;
  if (axle === "rear" && FRONT_ONLY_SUSPENSION.has(layout)) return false;
  return true;
}

export function isSuspensionCompatibleWithDrivetrain(
  layout: string,
  axle: "front" | "rear",
  drivetrain?: string,
): boolean {
  if (!isSuspensionLegalForAxle(layout, axle)) return false;
  if (axle !== "front") return true;
  if (drivetrain === "FrontAxleHybrid" || drivetrain === "FullEV") {
    return !FRONT_E_AXLE_INCOMPATIBLE.has(layout);
  }
  return true;
}

export function suspensionIncompatibilityReason(
  layout: string,
  axle: "front" | "rear",
  drivetrain?: string,
): string | null {
  if (axle === "front" && REAR_ONLY_SUSPENSION.has(layout)) {
    return "Rear multilink layout cannot be used on the front axle";
  }
  if (axle === "rear" && FRONT_ONLY_SUSPENSION.has(layout)) {
    return "MacPherson strut is front-axle only";
  }
  if (
    axle === "front" &&
    (drivetrain === "FrontAxleHybrid" || drivetrain === "FullEV") &&
    FRONT_E_AXLE_INCOMPATIBLE.has(layout)
  ) {
    return "Front e-axle needs double-wishbone / pushrod front packaging";
  }
  return null;
}

export function validateWheelSetup(setup: WheelSetup, classId: string): string | null {
  const limits = wheelLimitsForClass(classId);
  const check = (v: number, r: SliderRange, label: string) => {
    if (v < r.min - 0.001 || v > r.max + 0.001) {
      return `${label} must be ${r.min}–${r.max}`;
    }
    return null;
  };
  return (
    check(setup.frontDiameterIn, limits.frontDiameter, "Front wheel diameter") ??
    check(setup.rearDiameterIn, limits.rearDiameter, "Rear wheel diameter") ??
    check(setup.frontWidthMm, limits.frontWidth, "Front tyre width") ??
    check(setup.rearWidthMm, limits.rearWidth, "Rear tyre width")
  );
}

function validateSuspensionTuning(
  setup: SuspensionSetup,
  build: CarBuildPayload,
  parts: PartOptionPayload[] | undefined,
  classId: string,
): string | null {
  const base = suspensionBaselines(build, parts);
  const rh = rideHeightLimitsForClass(classId);
  const checkRange = (v: number, min: number, max: number, label: string) => {
    if (v < min - 0.001 || v > max + 0.001) {
      return `${label} must be ${min}–${max}`;
    }
    return null;
  };

  const frontSpringRange = springRateRange(base.frontSpringNm);
  const rearSpringRange = springRateRange(base.rearSpringNm);

  return (
    checkRange(setup.frontRideHeightMm, rh.min, rh.max, "Front ride height") ??
    checkRange(setup.rearRideHeightMm, rh.min, rh.max, "Rear ride height") ??
    checkRange(
      setup.frontSpringNm,
      frontSpringRange.min,
      frontSpringRange.max,
      "Front spring rate",
    ) ??
    checkRange(
      setup.rearSpringNm,
      rearSpringRange.min,
      rearSpringRange.max,
      "Rear spring rate",
    ) ??
    checkRange(
      setup.frontArbStiffness,
      ARB_STIFFNESS_LIMITS.min,
      ARB_STIFFNESS_LIMITS.max,
      "Front anti-roll bar",
    ) ??
    checkRange(
      setup.rearArbStiffness,
      ARB_STIFFNESS_LIMITS.min,
      ARB_STIFFNESS_LIMITS.max,
      "Rear anti-roll bar",
    ) ??
    checkRange(setup.frontDamperBump, DAMPER_LIMITS.min, DAMPER_LIMITS.max, "Front bump") ??
    checkRange(
      setup.frontDamperRebound,
      DAMPER_LIMITS.min,
      DAMPER_LIMITS.max,
      "Front rebound",
    ) ??
    checkRange(setup.rearDamperBump, DAMPER_LIMITS.min, DAMPER_LIMITS.max, "Rear bump") ??
    checkRange(
      setup.rearDamperRebound,
      DAMPER_LIMITS.min,
      DAMPER_LIMITS.max,
      "Rear rebound",
    )
  );
}

export function validateSuspensionSetup(
  build: CarBuildPayload,
  legalLayouts: Set<string> | undefined,
  classId?: string,
  parts?: PartOptionPayload[],
): string | null {
  const drivetrain = build.engine?.drivetrain;
  const { front, rear } = resolveSuspensionLayouts(build);

  for (const layout of [front, rear]) {
    if (legalLayouts && !legalLayouts.has(layout)) {
      return `${layout} is not legal in this class`;
    }
  }

  for (const [axle, layout] of [
    ["front", front],
    ["rear", rear],
  ] as const) {
    const reason = suspensionIncompatibilityReason(layout, axle, drivetrain);
    if (reason) return reason;
  }

  if (classId) {
    const setup = resolveSuspensionSetup(build, parts, classId);
    const tuningErr = validateSuspensionTuning(setup, build, parts, classId);
    if (tuningErr) return tuningErr;
  }

  return null;
}

/** Fill axle suspension + wheel slider fields from legacy single-value build. */
export function normalizeCarBuild(
  build: CarBuildPayload,
  classId: string,
  partsBySlot?: Record<string, PartOptionPayload[]>,
): CarBuildPayload {
  const packagePart = partsBySlot?.wheel_package?.find(
    (p) => p.partType === build.wheel_package,
  );
  const wheel = clampWheelSetup(resolveWheelSetup(build, classId, packagePart), classId);
  const { front, rear } = resolveSuspensionLayouts(build);
  const drivetrain = build.engine?.drivetrain;

  let frontLayout = front;
  let rearLayout = rear;
  if (!isSuspensionCompatibleWithDrivetrain(frontLayout, "front", drivetrain)) {
    frontLayout =
      partsBySlot?.suspension?.find((p) =>
        isSuspensionCompatibleWithDrivetrain(p.partType, "front", drivetrain),
      )?.partType ?? "PushrodDoubleWishbone";
  }
  if (!isSuspensionLegalForAxle(rearLayout, "rear")) {
    rearLayout =
      partsBySlot?.suspension?.find((p) => isSuspensionLegalForAxle(p.partType, "rear"))
        ?.partType ?? "PushrodDoubleWishbone";
  }

  const suspensionParts = partsBySlot?.suspension;
  const layoutBuild = {
    ...build,
    front_suspension_layout: frontLayout,
    rear_suspension_layout: rearLayout,
  };
  const suspension = clampSuspensionSetup(
    resolveSuspensionSetup(layoutBuild, suspensionParts, classId),
    layoutBuild,
    suspensionParts,
    classId,
  );

  const diffuserType =
    build.rear_aero_type === "WinglessGroundEffect" &&
    (!build.diffuser_type || build.diffuser_type === "StockFloor")
      ? "WinglessBaseline"
      : (build.diffuser_type ?? "StockFloor");

  return {
    ...build,
    diffuser_type: diffuserType,
    exhaust_type: normalizeExhaustType(build.exhaust_type, build.engine),
    suspension_layout: build.suspension_layout || frontLayout,
    front_suspension_layout: frontLayout,
    rear_suspension_layout: rearLayout,
    front_wheel_diameter_in: wheel.frontDiameterIn,
    rear_wheel_diameter_in: wheel.rearDiameterIn,
    front_tire_width_mm: wheel.frontWidthMm,
    rear_tire_width_mm: wheel.rearWidthMm,
    ...suspensionSetupToBuildFields(suspension),
  };
}

export function wheelSetupToBuildFields(
  setup: WheelSetup,
): Pick<
  CarBuildPayload,
  | "front_wheel_diameter_in"
  | "rear_wheel_diameter_in"
  | "front_tire_width_mm"
  | "rear_tire_width_mm"
> {
  return {
    front_wheel_diameter_in: setup.frontDiameterIn,
    rear_wheel_diameter_in: setup.rearDiameterIn,
    front_tire_width_mm: setup.frontWidthMm,
    rear_tire_width_mm: setup.rearWidthMm,
  };
}

export function suspensionSetupToBuildFields(
  setup: SuspensionSetup,
): Pick<
  CarBuildPayload,
  | "front_ride_height_mm"
  | "rear_ride_height_mm"
  | "front_spring_nm"
  | "rear_spring_nm"
  | "front_arb_stiffness"
  | "rear_arb_stiffness"
  | "front_damper_bump"
  | "front_damper_rebound"
  | "rear_damper_bump"
  | "rear_damper_rebound"
> {
  return {
    front_ride_height_mm: setup.frontRideHeightMm,
    rear_ride_height_mm: setup.rearRideHeightMm,
    front_spring_nm: setup.frontSpringNm,
    rear_spring_nm: setup.rearSpringNm,
    front_arb_stiffness: setup.frontArbStiffness,
    rear_arb_stiffness: setup.rearArbStiffness,
    front_damper_bump: setup.frontDamperBump,
    front_damper_rebound: setup.frontDamperRebound,
    rear_damper_bump: setup.rearDamperBump,
    rear_damper_rebound: setup.rearDamperRebound,
  };
}
