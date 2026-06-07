import {
  appendSetupParts,
  hasSetupDelta,
  PIT_SETUP_SEC,
  type PitSetupDelta,
} from "./setupCommands";

/** Mirrors src/sim/pit_stop.cpp constants and duration logic. */
export const PIT_LANE_FRACTION = 0.06;
export const PIT_LANE_SPEED_KMH = 60;
export const PIT_FUEL_SEC_PER_L = 0.038;
export const PIT_TIRE_SEC = 2.8;
export const PIT_REPAIR_ENGINE_SEC = 12;
export const PIT_REPAIR_BODY_SEC = 8;
/** Mirrors PartDamageRepairSpec in src/core/part_damage.cpp */
export const PIT_REPAIR_PART_SEC: Record<string, number> = {
  engine: 12,
  gearbox: 10,
  cooling: 8,
  brakes: 6,
  aero_front: 7,
  aero_rear: 7,
  body_fl: 8,
  body_fr: 8,
  body_rl: 8,
  body_rr: 8,
  susp_fl: 9,
  susp_fr: 9,
  susp_rl: 9,
  susp_rr: 9,
  body: 32,
  bodywork: 32,
};
export const PIT_DRIVER_CHANGE_SEC = 15;
export { PIT_SETUP_SEC, type PitSetupDelta };

let trackLapLengthM = 7000;

export function setTrackLapLengthMeters(meters: number): void {
  if (meters > 0) trackLapLengthM = meters;
}

/** One-way pit lane drive at the 60 km/h limiter (entry → box → exit). */
export function estimatePitLaneTravelSeconds(lapLengthM = trackLapLengthM): number {
  const laneLengthM = lapLengthM * PIT_LANE_FRACTION;
  const speedMs = PIT_LANE_SPEED_KMH / 3.6;
  return laneLengthM / speedMs;
}

export interface PitEstimateOptions {
  fuel: number;
  tireCount: number;
  repairEngine?: boolean;
  repairBody?: boolean;
  repairParts?: string[];
  driverChange?: boolean;
  setup?: PitSetupDelta;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  mechanicSkill?: number;
  engineerSkill?: number;
  lapLengthM?: number;
}

export function estimatePitServiceSeconds(options: PitEstimateOptions): number {
  const {
    fuel,
    tireCount,
    repairEngine = false,
    repairBody = false,
    repairParts = [],
    driverChange = false,
    setup,
    serviceabilityFactor = 1,
    driverChangeFactor = 1,
    mechanicSkill = 75,
    engineerSkill = 75,
  } = options;

  const mechanicFactor = 1 - (mechanicSkill / 100 - 0.5) * 0.25;
  const engineerFactor = 1 - (engineerSkill / 100 - 0.5) * 0.2;
  const pitWorkScale = 1 / Math.max(0.5, serviceabilityFactor);
  const driverSwapScale = 1 / Math.max(0.5, driverChangeFactor);

  let total = 0;
  if (fuel > 0) {
    total += fuel * PIT_FUEL_SEC_PER_L * mechanicFactor * pitWorkScale;
  }
  total += tireCount * PIT_TIRE_SEC * mechanicFactor * pitWorkScale;
  if (repairEngine) {
    total += PIT_REPAIR_ENGINE_SEC * mechanicFactor * pitWorkScale;
  }
  if (repairBody) {
    total += PIT_REPAIR_BODY_SEC * 4 * mechanicFactor * pitWorkScale;
  }
  for (const token of repairParts) {
    const sec = PIT_REPAIR_PART_SEC[token.toLowerCase()];
    if (sec) total += sec * mechanicFactor * pitWorkScale;
  }
  if (driverChange) {
    total += PIT_DRIVER_CHANGE_SEC * mechanicFactor * driverSwapScale;
  }
  if (setup && hasSetupDelta(setup)) {
    total += PIT_SETUP_SEC * engineerFactor;
  }
  return Math.max(5, total);
}

export function estimatePitSeconds(options: PitEstimateOptions): number {
  const lapLengthM = options.lapLengthM ?? trackLapLengthM;
  return (
    estimatePitLaneTravelSeconds(lapLengthM) +
    estimatePitServiceSeconds(options)
  );
}

export function estimateDriverChangeSeconds(
  driverChangeFactor = 1,
  mechanicSkill = 75,
): number {
  const mechanicFactor = 1 - (mechanicSkill / 100 - 0.5) * 0.25;
  const driverSwapScale = 1 / Math.max(0.5, driverChangeFactor);
  return PIT_DRIVER_CHANGE_SEC * mechanicFactor * driverSwapScale;
}

export type PitTyreTread = "slick" | "intermediate" | "wet";

export interface PitStopOptions {
  fuel: number;
  compound: string;
  tyreTread?: PitTyreTread;
  tires: string[];
  repairs: string[];
  driverChange: boolean;
  driverIndex?: number;
  setup?: PitSetupDelta;
}

export function buildPitCommand(options: PitStopOptions): string {
  const tread = options.tyreTread ?? "slick";
  const parts = [
    "pit",
    `fuel=${options.fuel}`,
    `compound=${options.compound}`,
    `tyre_tread=${tread}`,
    `tires=${options.tires.join(",")}`,
  ];
  if (options.repairs.length) parts.push(`repairs=${options.repairs.join(",")}`);
  if (options.driverChange) {
    parts.push("driver_change=true");
    if (options.driverIndex != null && options.driverIndex >= 0) {
      parts.push(`driver_index=${options.driverIndex}`);
    }
  }
  if (options.setup) appendSetupParts(parts, options.setup);
  return parts.join("|");
}
