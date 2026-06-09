import type { EngineBuildPayload } from "../ws/protocol";
import type { PartOptionPayload } from "../ws/protocol";

export const BATTERY_PACK_PARTS = new Set([
  "BatteryPackSprint",
  "BatteryPackStandard",
  "BatteryPackEndurance",
]);

export const LIQUID_FUEL_TANK_PARTS = new Set([
  "StandardTank",
  "LeMans90L",
  "LeMans95L",
  "LeMans110L",
]);

export function isBatteryPackPart(partType: string): boolean {
  return BATTERY_PACK_PARTS.has(partType);
}

export function isLiquidFuelTankPart(partType: string): boolean {
  return LIQUID_FUEL_TANK_PARTS.has(partType);
}

export function defaultFuelSystemForEngine(
  engine: EngineBuildPayload | undefined,
  classId: string,
): string {
  if (engine?.fuel_type === "Hydrogen") return "HydrogenTank";
  if (engine?.fuel_type === "Electric") return "BatteryPackStandard";
  return classId === "Hypercar" ? "LeMans110L" : "StandardTank";
}

export function normalizeFuelSystemForEngine(
  fuelSystem: string,
  engine: EngineBuildPayload | undefined,
  classId: string,
): string {
  if (engine?.fuel_type === "Electric") {
    return isBatteryPackPart(fuelSystem) ? fuelSystem : "BatteryPackStandard";
  }
  if (engine?.fuel_type === "Hydrogen") {
    return fuelSystem === "HydrogenTank" ? fuelSystem : "HydrogenTank";
  }
  if (isBatteryPackPart(fuelSystem) || fuelSystem === "HydrogenTank") {
    return classId === "Hypercar" ? "LeMans110L" : "StandardTank";
  }
  return fuelSystem;
}

export function filterFuelSystemPartsForEngine(
  parts: PartOptionPayload[],
  engine: EngineBuildPayload | undefined,
): PartOptionPayload[] {
  if (engine?.fuel_type === "Electric") {
    return parts.filter((p) => isBatteryPackPart(p.partType));
  }
  if (engine?.fuel_type === "Hydrogen") {
    return parts.filter((p) => p.partType === "HydrogenTank");
  }
  return parts.filter(
    (p) => !isBatteryPackPart(p.partType) && p.partType !== "HydrogenTank",
  );
}

export function fuelSystemEnergyMj(part: PartOptionPayload | undefined): number {
  if (!part) return 0;
  const mj = part.stats.energy_mj;
  return typeof mj === "number" && mj > 0 ? mj : 0;
}

export function fuelSystemRexFuelL(part: PartOptionPayload | undefined): number {
  if (!part) return 0;
  const liters = part.stats.rex_fuel_l;
  return typeof liters === "number" && liters > 0 ? liters : 0;
}
