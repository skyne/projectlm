export type TyreTread = "slick" | "intermediate" | "wet";

export const WET_TYRE_THRESHOLD = 0.38;
export const INTER_TYRE_THRESHOLD = 0.15;
export const DRY_TYRE_THRESHOLD = 0.12;

export function normalizeTyreTread(raw?: string): TyreTread {
  const v = (raw ?? "slick").trim().toLowerCase();
  if (v === "wet" || v === "wets" || v === "full_wet") return "wet";
  if (v === "intermediate" || v === "inter" || v === "inters") return "intermediate";
  return "slick";
}

export function desiredTyreTread(trackWetness: number): TyreTread {
  if (trackWetness >= WET_TYRE_THRESHOLD) return "wet";
  if (trackWetness >= INTER_TYRE_THRESHOLD) return "intermediate";
  return "slick";
}

/** True when track conditions require a different tread than the car is on. */
export function needsWeatherTyreSwap(
  current: TyreTread,
  trackWetness: number,
): boolean {
  const target = desiredTyreTread(trackWetness);
  if (target === current) return false;
  return (
    trackWetness >= INTER_TYRE_THRESHOLD ||
    (trackWetness < DRY_TYRE_THRESHOLD && current !== "slick")
  );
}

export function syncTyreTreadFromSnap(
  state: { tyreTread: TyreTread },
  tireCompound: string | undefined,
  trackWetness: number,
): void {
  if (tireCompound) {
    state.tyreTread = normalizeTyreTread(tireCompound);
  } else if (trackWetness < DRY_TYRE_THRESHOLD) {
    state.tyreTread = "slick";
  }
}

export function tyreTreadFromFlags(options: {
  tyreTread?: string;
  wetTyres?: boolean;
  intermediateTyres?: boolean;
}): TyreTread {
  if (options.tyreTread) return normalizeTyreTread(options.tyreTread);
  if (options.wetTyres) return "wet";
  if (options.intermediateTyres) return "intermediate";
  return "slick";
}

function trackSurfaceGripFactor(trackTempC: number): number {
  if (trackTempC < 15) return Math.min(1, Math.max(0.88, 0.92 + (trackTempC - 15) * 0.004));
  if (trackTempC > 55) return Math.min(1, Math.max(0.88, 1 - (trackTempC - 55) * 0.004));
  const delta = Math.abs(trackTempC - 40);
  if (delta <= 5) return 1.02;
  if (delta <= 15) return 1.02 - (delta - 5) * 0.0015;
  return 0.98;
}

/** Mirrors C++ CompoundCrossoverGrip + weather wetness penalty. */
export function tyreGripScale(
  tread: TyreTread,
  trackWetness: number,
  ambientTempC = 22,
  trackTempC = ambientTempC,
): number {
  const wet = Math.min(1, Math.max(0, trackWetness));
  const tempDelta = ambientTempC - 26;

  let crossover = 1;
  if (tread === "wet") {
    const dryPenalty = wet < 0.2 ? 0.78 : 1;
    const wetBonus = wet < 0.35 ? 0.88 + wet * 0.35 : 0.95 + wet * 0.25;
    crossover = dryPenalty * wetBonus;
  } else if (tread === "intermediate") {
    if (wet < 0.1) crossover = 0.84;
    else if (wet < 0.22) crossover = 0.92 + (wet - 0.1) * 0.8;
    else if (wet < 0.5) crossover = 1.02;
    else if (wet < 0.65) crossover = 1.02 - (wet - 0.5) * 0.9;
    else crossover = 0.72;
  } else if (wet >= 0.45) {
    crossover = 0.64;
  } else if (wet >= 0.15) {
    crossover = 0.96;
  } else {
    crossover =
      Math.min(1.06, Math.max(0.88, 1 - Math.abs(tempDelta) * 0.008)) *
      trackSurfaceGripFactor(trackTempC);
  }

  const wetPenalty = 1 - wet * 0.22;
  const tempPenalty =
    ambientTempC > 34 ? 1 - Math.min(0.1, (ambientTempC - 34) * 0.005) : 1;
  return crossover * wetPenalty * tempPenalty;
}

export function tyreCompoundId(
  compound: "soft" | "medium" | "hard",
  tread: TyreTread,
): string {
  if (tread === "wet") return "wet";
  if (tread === "intermediate") return "intermediate";
  return compound;
}
