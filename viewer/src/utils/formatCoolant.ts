/** Coolant temp bands — matches physics_config thermal_overheat=105 */
export const COOLANT_OVERHEAT_C = 105;
export const COOLANT_IDLE_C = 70;

export function formatCoolantTemp(tempC: number | undefined): string {
  if (tempC == null || !Number.isFinite(tempC)) return "—";
  return `${Math.round(tempC)}°C`;
}

export type CoolantTempBand = "cold" | "normal" | "warm" | "hot" | "overheat";

export function coolantTempBand(tempC: number | undefined): CoolantTempBand {
  const t = tempC ?? COOLANT_IDLE_C;
  if (t >= COOLANT_OVERHEAT_C + 5) return "overheat";
  if (t >= COOLANT_OVERHEAT_C) return "hot";
  if (t >= 95) return "warm";
  if (t < COOLANT_IDLE_C) return "cold";
  return "normal";
}

export function coolantTempBarPercent(tempC: number | undefined): number {
  const t = tempC ?? COOLANT_IDLE_C;
  const min = COOLANT_IDLE_C - 10;
  const max = COOLANT_OVERHEAT_C + 15;
  return Math.round(
    ((Math.min(max, Math.max(min, t)) - min) / (max - min)) * 100,
  );
}

export function coolantStatusLabel(tempC: number | undefined): string {
  const band = coolantTempBand(tempC);
  switch (band) {
    case "overheat":
      return "Overheating";
    case "hot":
      return "At limit";
    case "warm":
      return "Warm";
    case "cold":
      return "Cold";
    default:
      return "Normal";
  }
}
