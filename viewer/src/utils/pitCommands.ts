/** Mirrors src/sim/pit_stop.cpp constants and duration logic. */
export const PIT_LANE_FRACTION = 0.06;
export const PIT_LANE_SPEED_KMH = 60;
export const PIT_FUEL_SEC_PER_L = 0.038;
export const PIT_TIRE_SEC = 2.8;
export const PIT_REPAIR_ENGINE_SEC = 12;
export const PIT_REPAIR_BODY_SEC = 8;
export const PIT_DRIVER_CHANGE_SEC = 15;

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
  driverChange?: boolean;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  mechanicSkill?: number;
  lapLengthM?: number;
}

export function estimatePitServiceSeconds(options: PitEstimateOptions): number {
  const {
    fuel,
    tireCount,
    repairEngine = false,
    repairBody = false,
    driverChange = false,
    serviceabilityFactor = 1,
    driverChangeFactor = 1,
    mechanicSkill = 75,
  } = options;

  const mechanicFactor = 1 - (mechanicSkill / 100 - 0.5) * 0.25;
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
    total += PIT_REPAIR_BODY_SEC * mechanicFactor * pitWorkScale;
  }
  if (driverChange) {
    total += PIT_DRIVER_CHANGE_SEC * mechanicFactor * driverSwapScale;
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

export interface PitStopOptions {
  fuel: number;
  compound: string;
  tires: string[];
  repairs: string[];
  driverChange: boolean;
  driverIndex?: number;
}

export function buildPitCommand(options: PitStopOptions): string {
  const parts = [
    "pit",
    `fuel=${options.fuel}`,
    `compound=${options.compound}`,
    `tires=${options.tires.join(",")}`,
  ];
  if (options.repairs.length) parts.push(`repairs=${options.repairs.join(",")}`);
  if (options.driverChange) {
    parts.push("driver_change=true");
    if (options.driverIndex != null && options.driverIndex >= 0) {
      parts.push(`driver_index=${options.driverIndex}`);
    }
  }
  return parts.join("|");
}
