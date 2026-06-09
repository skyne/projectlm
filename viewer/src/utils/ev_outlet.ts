import type { EngineBuildPayload } from "../ws/protocol";

/** Legal exhaust / underbody outlet parts for e-drive (BEV + H₂ fuel cell). */
export const EV_OUTLET_PARTS = new Set([
  "None",
  "ActiveUnderbody",
  "LowDragUnderfloor",
  "ThermalScoop",
  "WakeNeutralBody",
]);

export const EV_ONLY_OUTLET_PARTS = new Set([
  "ActiveUnderbody",
  "LowDragUnderfloor",
  "ThermalScoop",
  "WakeNeutralBody",
]);

export function isElectricDriveOutletBuild(
  engine?: EngineBuildPayload,
): boolean {
  if (!engine) return false;
  return (
    engine.fuel_type === "Electric" ||
    engine.drivetrain === "FullEV" ||
    engine.drivetrain === "RangeExtender" ||
    (engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell")
  );
}

export function isEvLegalOutlet(part: string): boolean {
  return EV_OUTLET_PARTS.has(part);
}

export function normalizeExhaustType(
  exhaustType: string | undefined,
  engine?: EngineBuildPayload,
): string {
  const ev = isElectricDriveOutletBuild(engine);
  const current =
    exhaustType ?? (ev ? "None" : "TwinOutletSide");
  if (ev) {
    return isEvLegalOutlet(current) ? current : "None";
  }
  if (current === "None" || EV_ONLY_OUTLET_PARTS.has(current)) {
    return "TwinOutletSide";
  }
  return current;
}
