import type { CarSnapshot } from "../ws/protocol";

/** BEV packs report MJ capacity (typically under 20); ICE tanks use liters. */
export function usesBatteryFuelDisplay(snap: Pick<CarSnapshot, "fuelTankCapacity" | "hybridBudgetMJ">): boolean {
  const cap = snap.fuelTankCapacity ?? 0;
  const budget = snap.hybridBudgetMJ ?? 0;
  return cap > 0 && cap <= 20 && budget > 0 && Math.abs(cap - budget) < 0.5;
}

export function formatFuelAmount(
  snap: Pick<CarSnapshot, "fuel" | "fuelTankCapacity" | "hybridBudgetMJ">,
): string {
  if (usesBatteryFuelDisplay(snap)) {
    const cap = snap.fuelTankCapacity ?? 1;
    const pct = Math.round((snap.fuel / cap) * 100);
    return `${snap.fuel.toFixed(1)} MJ (${pct}%)`;
  }
  return `${snap.fuel.toFixed(1)} L`;
}

export function formatFuelLabel(): string {
  return "Energy";
}

export function fuelColumnLabel(
  snap: Pick<CarSnapshot, "fuelTankCapacity" | "hybridBudgetMJ">,
): string {
  return usesBatteryFuelDisplay(snap) ? "Battery" : "Fuel";
}
