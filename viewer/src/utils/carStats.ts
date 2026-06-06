import type {
  CarBuildPayload,
  EngineBuildPayload,
  PartOptionPayload,
} from "../ws/protocol";
import {
  effectiveHorsepower,
  peakTorqueNm,
  resolvePowertrainTraits,
} from "./engineModel";
import {
  computeWheelStats,
  resolveSuspensionStats,
  resolveWheelSetup,
} from "./chassisSetup";
import { computeCoolingStats, decodeCoolingLayout } from "./cooling_model";

/** Assembly constants from configs/physics_config.txt — must match C++ AssemblyConfig. */
export const ASSEMBLY = {
  bodyBaseDragCd: 0.3,
  baseVehicleMass: 180,
  hpConversion: 7127,
  groundSuckNumerator: 0.05,
  groundSuckOffset: 0.01,
  groundEffectDownforce: 1.15,
  winglessDragReduction: 0.03,
  referenceStroke: 0.08,
  referenceRpm: 6000,
} as const;

/** Default weekend tyre compound grip (Medium) — compound is chosen at the track, not in garage. */
export const DEFAULT_TIRE_GRIP = 1.08;

export type PartSlot =
  | "chassis"
  | "front_aero"
  | "rear_aero"
  | "cooling"
  | "wheel_package"
  | "suspension"
  | "fuel_system"
  | "brake"
  | "transmission"
  | "hybrid";

export const BUILD_SLOTS: PartSlot[] = [
  "chassis",
  "front_aero",
  "rear_aero",
  "cooling",
  "wheel_package",
  "suspension",
  "fuel_system",
  "brake",
  "transmission",
  "hybrid",
];

export type SimBarId =
  | "power"
  | "grip"
  | "cornering"
  | "downforce"
  | "drag"
  | "mass"
  | "braking"
  | "shiftTime"
  | "fuel"
  | "pitWork"
  | "driverSwap"
  | "durability";

/**
 * Sim-facing performance axes — each maps to values TickSimulation reads from CarConfig.
 * Bar width is 0–100 (higher fill = better for that axis). The number column shows the raw sim value.
 * `lowerIsBetter` stats use ↓ on the label (e.g. drag Cd, mass, shift time).
 */
export interface SimStatBarDef {
  id: SimBarId;
  label: string;
  color: string;
  lowerIsBetter: boolean;
  formatValue: (compiled: CompiledCarStats) => string;
}

export function effectiveGripScore(compiled: CompiledCarStats): number {
  return compiled.gripIndex;
}

export function effectiveCorneringScore(compiled: CompiledCarStats): number {
  return compiled.corneringFactor * compiled.tyreBalanceFactor;
}

export function effectiveLateralScore(compiled: CompiledCarStats): number {
  return effectiveGripScore(compiled) * effectiveCorneringScore(compiled);
}

export const SIM_STAT_BARS: SimStatBarDef[] = [
  {
    id: "power",
    label: "Power",
    color: "#fb923c",
    lowerIsBetter: false,
    formatValue: (c) => `${Math.round(c.peakHorsepower)} hp`,
  },
  {
    id: "grip",
    label: "Grip",
    color: "#6ee7a0",
    lowerIsBetter: false,
    formatValue: (c) => `×${effectiveGripScore(c).toFixed(2)}`,
  },
  {
    id: "cornering",
    label: "Cornering",
    color: "#34d399",
    lowerIsBetter: false,
    formatValue: (c) => `×${effectiveCorneringScore(c).toFixed(2)}`,
  },
  {
    id: "downforce",
    label: "Downforce",
    color: "#60a5fa",
    lowerIsBetter: false,
    formatValue: (c) => `Cl ${c.totalDownforceCl.toFixed(2)}`,
  },
  {
    id: "drag",
    label: "Drag",
    color: "#a78bfa",
    lowerIsBetter: true,
    formatValue: (c) => `Cd ${c.totalDragCd.toFixed(3)}`,
  },
  {
    id: "mass",
    label: "Mass",
    color: "#fbbf24",
    lowerIsBetter: true,
    formatValue: (c) => `${Math.round(c.calculatedTotalMass)} kg`,
  },
  {
    id: "braking",
    label: "Braking",
    color: "#f87171",
    lowerIsBetter: false,
    formatValue: (c) =>
      `${Math.round(c.brakeMaxPressure * c.brakeFadeResistance * 100)}%`,
  },
  {
    id: "shiftTime",
    label: "Shift time",
    color: "#38bdf8",
    lowerIsBetter: true,
    formatValue: (c) => `${Math.round(c.shiftDelaySec * 1000)} ms`,
  },
  {
    id: "fuel",
    label: "Fuel capacity",
    color: "#c084fc",
    lowerIsBetter: false,
    formatValue: (c) => `${Math.round(c.fuelTankCapacity)} L`,
  },
  {
    id: "pitWork",
    label: "Pit service",
    color: "#94a3b8",
    lowerIsBetter: false,
    formatValue: (c) => `×${c.serviceabilityFactor.toFixed(2)}`,
  },
  {
    id: "driverSwap",
    label: "Driver swap",
    color: "#e879f9",
    lowerIsBetter: false,
    formatValue: (c) => `×${c.driverChangeFactor.toFixed(2)}`,
  },
  {
    id: "durability",
    label: "Durability",
    color: "#86efac",
    lowerIsBetter: false,
    formatValue: (c) => `×${c.structuralRigidityFactor.toFixed(2)}`,
  },
];

/** Raw compiled values mirroring CompileCarArchitecture output. */
export interface CompiledCarStats {
  peakHorsepower: number;
  peakTorqueNm: number;
  hybridDeployKw: number;
  totalDownforceCl: number;
  totalDragCd: number;
  /** tyreGrip × wheelGrip × widthBlend × mechanicalGrip */
  gripIndex: number;
  /** sqrt(max(0.75, rollStiffness)) × CG — chassis cornering */
  corneringFactor: number;
  /** Front/rear width balance — understeer & turn-in */
  tyreBalanceFactor: number;
  calculatedTotalMass: number;
  brakeMaxPressure: number;
  brakeFadeResistance: number;
  shiftDelaySec: number;
  fuelTankCapacity: number;
  coolingCapacity: number;
  vibrationIndex: number;
  engineMassKg: number;
  serviceabilityFactor: number;
  driverChangeFactor: number;
  structuralRigidityFactor: number;
}

export interface CompileOptions {
  powerCapHp?: number;
  minWeightKg?: number;
  maxWeightKg?: number;
  tireGripMultiplier?: number;
  classId?: string;
}

function findPart(
  partsBySlot: Record<string, PartOptionPayload[]>,
  slot: PartSlot,
  type: string,
): PartOptionPayload | undefined {
  return partsBySlot[slot]?.find((p) => p.partType === type);
}

function num(stats: Record<string, number>, key: string, fallback = 0): number {
  const v = stats[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Mirrors C++ CompileCarArchitecture — garage preview without tyre compound swap. */
export function compileCarStats(
  build: CarBuildPayload,
  partsBySlot: Record<string, PartOptionPayload[]>,
  options: CompileOptions = {},
): CompiledCarStats {
  const classId = options.classId ?? "Hypercar";
  const ch = findPart(partsBySlot, "chassis", build.chassis_type);
  const fa = findPart(partsBySlot, "front_aero", build.front_aero_type);
  const ra = findPart(partsBySlot, "rear_aero", build.rear_aero_type);
  const coolingLayout = decodeCoolingLayout(build);
  const coolingStats = computeCoolingStats(
    coolingLayout,
    build.duct_airflow ?? 1,
    build.engine,
    classId,
  );
  const wp = findPart(partsBySlot, "wheel_package", build.wheel_package);
  const wheelSetup = resolveWheelSetup(build, classId, wp);
  const wheelStats = computeWheelStats(wheelSetup, wp, classId);
  const suspension = resolveSuspensionStats(build, partsBySlot.suspension);
  const fs = findPart(partsBySlot, "fuel_system", build.fuel_system);
  const bp = findPart(partsBySlot, "brake", build.brake_system);
  const tr = findPart(partsBySlot, "transmission", build.transmission);
  const hp = findPart(partsBySlot, "hybrid", build.hybrid_system);

  const rideHeightM = suspension.rideHeight;
  const rollStiffness = suspension.rollStiffness;
  const mechanicalGrip = suspension.mechanicalGrip;
  const unsprungFactor = suspension.unsprungFactor;

  const wheelGrip = wheelStats.gripFactor;
  const unsprungMass = wheelStats.unsprungMass * unsprungFactor;
  const widthGripFactor = wheelStats.widthGripBlend;

  const tireGrip = options.tireGripMultiplier ?? DEFAULT_TIRE_GRIP;
  const gripIndex = tireGrip * wheelGrip * widthGripFactor * mechanicalGrip;
  const tyreBalanceFactor = wheelStats.balanceFactor;
  const corneringFactor = Math.sqrt(Math.max(0.75, rollStiffness));

  let totalDragCd =
    ASSEMBLY.bodyBaseDragCd +
    (ch ? num(ch.stats, "drag") : 0) +
    (fa ? num(fa.stats, "drag") : 0) +
    (ra ? num(ra.stats, "drag") : 0) +
    coolingStats.dragCd +
    wheelStats.dragCd;

  let totalDownforceCl =
    (fa ? num(fa.stats, "downforce") : 0) +
    (ra ? num(ra.stats, "downforce") : 0);

  const permitsWingless = ra ? num(ra.stats, "permits_wingless") > 0 : false;
  if (permitsWingless) {
    const groundSuck =
      ASSEMBLY.groundSuckNumerator / (rideHeightM + ASSEMBLY.groundSuckOffset);
    totalDownforceCl += ASSEMBLY.groundEffectDownforce * groundSuck;
    totalDragCd -= ASSEMBLY.winglessDragReduction;
  }

  const partMass =
    (ch?.mass ?? 0) +
    (fa?.mass ?? 0) +
    (ra?.mass ?? 0) +
    coolingStats.massKg +
    wheelStats.mass +
    suspension.mass +
    (fs?.mass ?? 0) +
    (bp?.mass ?? 0) +
    (tr?.mass ?? 0) +
    (hp?.mass ?? 0);

  const engine: EngineBuildPayload | undefined = build.engine;
  const traits = engine ? resolvePowertrainTraits(engine, classId) : null;
  const engMass = traits
    ? traits.engineMassKg + traits.drivetrainExtraMassKg
    : 0;
  let peakHp = engine
    ? effectiveHorsepower(engine, options.powerCapHp ?? 0, classId)
    : 0;
  const torque = engine ? peakTorqueNm(engine) : 0;

  let totalMass =
    partMass + unsprungMass + engMass + ASSEMBLY.baseVehicleMass;

  if (options.minWeightKg && options.minWeightKg > 0) {
    totalMass = Math.max(totalMass, options.minWeightKg);
  }
  if (options.maxWeightKg && options.maxWeightKg > 0) {
    totalMass = Math.min(totalMass, options.maxWeightKg);
  }

  const brakePressure = bp ? num(bp.stats, "max_pressure", 0.72) : 0.72;
  const brakeFade = bp ? num(bp.stats, "fade", 0.14) : 0.14;
  let shiftDelay = tr ? num(tr.stats, "shift_delay", 0.07) : 0.07;
  const fuelCapacity = fs ? num(fs.stats, "capacity", 100) : 100;
  const cooling = coolingStats.dissipation;
  let hybridKw = hp ? num(hp.stats, "deploy_kw") : 0;
  if (traits && traits.deployKw > 0) hybridKw = traits.deployKw;

  let vibration = 0;
  if (engine && traits) {
    vibration =
      traits.stressMult *
      (engine.stroke / ASSEMBLY.referenceStroke) *
      (engine.max_rpm / ASSEMBLY.referenceRpm);
  }

  const corneringWithCg = corneringFactor * (traits?.cgCorneringBonus ?? 1);
  const serviceability =
    (ch ? num(ch.stats, "serviceability", 1) : 1) *
    (traits?.serviceabilityMult ?? 1);

  if (traits?.isElectricDrive) shiftDelay = tr?.partType === "SingleSpeedEDrive" ? 0 : shiftDelay * 0.4;

  return {
    peakHorsepower: peakHp,
    peakTorqueNm: torque,
    hybridDeployKw: hybridKw,
    totalDownforceCl,
    totalDragCd,
    gripIndex,
    corneringFactor: corneringWithCg,
    tyreBalanceFactor,
    calculatedTotalMass: totalMass,
    brakeMaxPressure: brakePressure,
    brakeFadeResistance: 1 - brakeFade,
    shiftDelaySec: shiftDelay,
    fuelTankCapacity: fuelCapacity,
    coolingCapacity: cooling,
    vibrationIndex: vibration,
    engineMassKg: engMass,
    serviceabilityFactor: serviceability,
    driverChangeFactor: ch ? num(ch.stats, "driver_change", 1) : 1,
    structuralRigidityFactor: ch ? num(ch.stats, "rigidity", 1) : 1,
  };
}

function clamp01(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function lerpNorm(value: number, min: number, max: number, invert = false): number {
  if (max <= min) return 50;
  const t = (value - min) / (max - min);
  const n = invert ? 1 - t : t;
  return clamp01(n * 100);
}

/** Convert compiled sim values to 0–100 bar widths. */
export function toBarValues(compiled: CompiledCarStats): Record<SimBarId, number> {
  const powerHp = compiled.peakHorsepower + compiled.hybridDeployKw * 0.35;
  const gripScore = effectiveGripScore(compiled);
  const corneringScore = effectiveCorneringScore(compiled);

  return {
    power: lerpNorm(powerHp, 380, 720),
    grip: lerpNorm(gripScore, 0.82, 1.08),
    cornering: lerpNorm(corneringScore, 0.82, 1.08),
    downforce: lerpNorm(compiled.totalDownforceCl, 2.0, 5.5),
    drag: lerpNorm(compiled.totalDragCd, 0.42, 0.62, true),
    mass: lerpNorm(compiled.calculatedTotalMass, 1120, 920, true),
    braking: lerpNorm(
      compiled.brakeMaxPressure * compiled.brakeFadeResistance,
      0.58,
      0.86,
    ),
    shiftTime: lerpNorm(compiled.shiftDelaySec, 0.075, 0.045, true),
    fuel: lerpNorm(compiled.fuelTankCapacity, 85, 115),
    pitWork: lerpNorm(compiled.serviceabilityFactor, 0.88, 1.1),
    driverSwap: lerpNorm(compiled.driverChangeFactor, 0.86, 1.12),
    durability: lerpNorm(compiled.structuralRigidityFactor, 0.9, 1.36),
  };
}

export function formatStatSummary(compiled: CompiledCarStats): string {
  return SIM_STAT_BARS.map((def) => {
    const polarity = def.lowerIsBetter ? "↓" : "↑";
    return `${def.label} ${polarity} ${def.formatValue(compiled)}`;
  })
    .join(" · ");
}

function rawNumericValue(id: SimBarId, compiled: CompiledCarStats): number {
  switch (id) {
    case "power":
      return compiled.peakHorsepower + compiled.hybridDeployKw * 0.35;
    case "grip":
      return effectiveGripScore(compiled);
    case "cornering":
      return effectiveCorneringScore(compiled);
    case "downforce":
      return compiled.totalDownforceCl;
    case "drag":
      return compiled.totalDragCd;
    case "mass":
      return compiled.calculatedTotalMass;
    case "braking":
      return compiled.brakeMaxPressure * compiled.brakeFadeResistance;
    case "shiftTime":
      return compiled.shiftDelaySec;
    case "fuel":
      return compiled.fuelTankCapacity;
    case "pitWork":
      return compiled.serviceabilityFactor;
    case "driverSwap":
      return compiled.driverChangeFactor;
    case "durability":
      return compiled.structuralRigidityFactor;
  }
}

const RAW_EPSILON: Record<SimBarId, number> = {
  power: 0.5,
  grip: 0.002,
  cornering: 0.002,
  downforce: 0.01,
  drag: 0.0005,
  mass: 0.5,
  braking: 0.002,
  shiftTime: 0.0005,
  fuel: 0.5,
  pitWork: 0.005,
  driverSwap: 0.005,
  durability: 0.005,
};

function formatRawDelta(id: SimBarId, diff: number): string {
  const sign = diff > 0 ? "+" : "−";
  const n = Math.abs(diff);
  switch (id) {
    case "power":
      return `${sign}${Math.round(n)} hp`;
    case "grip":
    case "cornering":
      return `${sign}${n.toFixed(2)}`;
    case "downforce":
      return `${sign}${n.toFixed(2)} Cl`;
    case "drag":
      return `${sign}${n.toFixed(3)} Cd`;
    case "mass":
      return `${sign}${Math.round(n)} kg`;
    case "braking":
      return `${sign}${Math.round(n * 100)}%`;
    case "shiftTime":
      return `${sign}${Math.round(n * 1000)} ms`;
    case "fuel":
      return `${sign}${Math.round(n)} L`;
    case "pitWork":
    case "driverSwap":
    case "durability":
      return `${sign}${n.toFixed(2)}`;
  }
}

export interface StatChange {
  improved: boolean;
  text: string;
  barDelta: number;
}

export function computeStatChange(
  def: SimStatBarDef,
  current: CompiledCarStats,
  baseline: CompiledCarStats,
  currentBar: number,
  baselineBar: number,
): StatChange | null {
  const diff = rawNumericValue(def.id, current) - rawNumericValue(def.id, baseline);
  const barDelta = currentBar - baselineBar;
  if (
    Math.abs(diff) < RAW_EPSILON[def.id] &&
    Math.abs(barDelta) < 0.25
  ) {
    return null;
  }
  const improved = def.lowerIsBetter ? diff < 0 : diff > 0;
  return {
    improved,
    text: formatRawDelta(def.id, diff),
    barDelta,
  };
}

export function statBarHtml(
  def: SimStatBarDef,
  barValue: number,
  compiled: CompiledCarStats,
  baseline?: CompiledCarStats,
  baselineBar?: number,
): string {
  const polarity = def.lowerIsBetter
    ? `<span class="perf-stat-polarity lower" title="Lower is better">↓</span>`
    : `<span class="perf-stat-polarity higher" title="Higher is better">↑</span>`;

  const change =
    baseline && baselineBar !== undefined
      ? computeStatChange(def, compiled, baseline, barValue, baselineBar)
      : null;

  const rowClass = change
    ? ` perf-stat-row--${change.improved ? "improved" : "worse"}`
    : "";

  const changeHtml = change
    ? `<span class="perf-stat-change ${change.improved ? "up" : "down"}">${change.text}</span>`
    : "";

  const barDeltaHtml =
    change && Math.abs(change.barDelta) >= 0.25
      ? `<span class="perf-stat-delta ${change.improved ? "up" : "down"}">${change.barDelta > 0 ? "+" : ""}${Math.round(change.barDelta)}</span>`
      : `<span class="perf-stat-delta neutral"></span>`;

  return `
    <div class="perf-stat-row${rowClass}">
      <span class="perf-stat-label"><span class="perf-stat-name">${def.label}</span>${polarity}</span>
      <div class="perf-stat-bar"><div class="perf-stat-fill" style="width: ${barValue}%; background: ${def.color}"></div></div>
      <span class="perf-stat-num"><span class="perf-stat-value">${def.formatValue(compiled)}</span>${changeHtml}</span>
      ${barDeltaHtml}
    </div>
  `;
}

/** Per-slot sim stats shown on part cards (only what the sim reads). */
export interface PartStatLine {
  label: string;
  value: string;
  /** true = higher is better for lap time / stint */
  positive: boolean;
}

const stat = (
  label: string,
  value: string,
  positive: boolean,
): PartStatLine => ({ label, value, positive });

export function partStatLines(
  slot: PartSlot,
  part: PartOptionPayload,
): PartStatLine[] {
  const s = part.stats;
  switch (slot) {
    case "chassis":
      return [
        stat("Pit work", `×${num(s, "serviceability", 1).toFixed(2)}`, true),
        stat("Driver swap", `×${num(s, "driver_change", 1).toFixed(2)}`, true),
        stat("Durability", `×${num(s, "rigidity", 1).toFixed(2)}`, true),
        stat("Drag", `+${num(s, "drag").toFixed(3)} Cd`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "front_aero":
      return [
        stat("Downforce", `Cl ${num(s, "downforce").toFixed(2)}`, true),
        stat("Drag", `+${num(s, "drag").toFixed(3)} Cd`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "rear_aero":
      return [
        stat("Downforce", `Cl ${num(s, "downforce").toFixed(2)}`, true),
        stat("Drag", `+${num(s, "drag").toFixed(3)} Cd`, false),
        ...(num(s, "permits_wingless") > 0
          ? [stat("Ground effect", "enabled", true)]
          : []),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "cooling":
      return [
        stat("Cooling", `×${num(s, "dissipation").toFixed(2)}`, true),
        stat("Drag", `+${num(s, "drag").toFixed(3)} Cd`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "wheel_package": {
      const fDia = num(s, "front_diameter_m");
      const rDia = num(s, "rear_diameter_m");
      const fW = num(s, "front_width_mm");
      const rW = num(s, "rear_width_mm");
      const fIn = Math.round((fDia * 1000) / 25.4);
      const rIn = Math.round((rDia * 1000) / 25.4);
      return [
        stat("Grip", `×${num(s, "grip_factor").toFixed(2)}`, true),
        stat("Wheels", `F ${fIn}"×${fW}mm R ${rIn}"×${rW}mm`, true),
        stat("Drag", `+${num(s, "drag_cd").toFixed(3)} Cd`, false),
        stat("Wear", `×${num(s, "wear_factor").toFixed(2)}`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    }
    case "suspension":
      return [
        stat("Mech grip", `×${num(s, "mechanical_grip").toFixed(2)}`, true),
        stat("Roll stiff", `×${num(s, "roll_stiffness").toFixed(2)}`, true),
        stat("Aero platform", `×${num(s, "aero_stability").toFixed(2)}`, true),
        stat("Ride height", `${(num(s, "ride_height", 0.04) * 1000).toFixed(0)} mm`, true),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "fuel_system":
      return [
        stat("Capacity", `${num(s, "capacity").toFixed(0)} L`, true),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "brake":
      return [
        stat("Pressure", `${(num(s, "max_pressure") * 100).toFixed(0)}%`, true),
        stat("Heat fade", `${(num(s, "fade") * 100).toFixed(0)}%`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "transmission":
      return [
        stat("Gears", `${num(s, "gear_count", 6).toFixed(0)}`, true),
        stat("Shift time", `${(num(s, "shift_delay", 0.07) * 1000).toFixed(0)} ms`, false),
        stat("Mass", `${part.mass} kg`, false),
      ];
    case "hybrid":
      if (num(s, "deploy_kw") <= 0) {
        return [stat("Hybrid", "none", true), stat("Mass", `${part.mass} kg`, false)];
      }
      return [
        stat("Deploy", `${num(s, "deploy_kw").toFixed(0)} kW`, true),
        stat("Regen", `×${num(s, "regen_rate").toFixed(2)}`, true),
        stat("Budget", `${num(s, "stint_budget_mj").toFixed(1)} MJ/stint`, true),
        stat("Mass", `${part.mass} kg`, false),
      ];
    default:
      return [];
  }
}

export function formatPartStatLines(lines: PartStatLine[]): string {
  return lines
    .map((l) => {
      const cls = l.positive ? "part-stat-good" : "part-stat-bad";
      return `<span class="part-stat-line ${cls}">${l.label} ${l.value}</span>`;
    })
    .join("");
}

export function formatCompiledSummary(compiled: CompiledCarStats): string {
  return [
    `${Math.round(compiled.calculatedTotalMass)} kg`,
    `${Math.round(compiled.peakHorsepower)} hp`,
    compiled.hybridDeployKw > 0 ? `+${compiled.hybridDeployKw} kW hybrid` : null,
    `Cl ${compiled.totalDownforceCl.toFixed(2)}`,
    `Cd ${compiled.totalDragCd.toFixed(3)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
