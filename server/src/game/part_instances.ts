import type { PartCategory } from "./facilities";

export type PartInstanceSource = "inhouse" | "shelved" | "licensed";

export interface PartInstance {
  id: string;
  catalogId: string;
  slot: string;
  category: PartCategory;
  source: PartInstanceSource;
  /** 0..1 toward catalog performance ceiling */
  performanceMaturity: number;
  /** 0..1 failure / wear resistance */
  reliabilityMaturity: number;
  /** Intrinsic understanding — transfers across cars/tracks */
  partUnderstanding: number;
  /** Per fleetCarId → per trackId → 0..1 local familiarity */
  contextFamiliarity: Record<string, Record<string, number>>;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function newPartInstance(
  catalogId: string,
  slot: string,
  category: PartCategory,
  source: PartInstanceSource,
): PartInstance {
  const basePerf = source === "inhouse" ? 0.55 : source === "licensed" ? 0.85 : 0.92;
  const baseRel = source === "shelved" ? 0.5 : 0.35;
  return {
    id: `part-${catalogId}-${Date.now()}`,
    catalogId,
    slot,
    category,
    source,
    performanceMaturity: basePerf,
    reliabilityMaturity: baseRel,
    partUnderstanding: source === "inhouse" ? 0.2 : 0.45,
    contextFamiliarity: {},
  };
}

export function effectivePerformanceStat(
  catalogMax: number,
  inhouseBase: number,
  maturity: number,
): number {
  return inhouseBase + (catalogMax - inhouseBase) * clamp01(maturity);
}

export function advancePartFocus(
  part: PartInstance,
  focus: "performance" | "reliability" | "understanding",
  amount: number,
): PartInstance {
  const d = Math.max(0, amount);
  const next = { ...part, contextFamiliarity: { ...part.contextFamiliarity } };
  if (focus === "performance") {
    next.performanceMaturity = clamp01(part.performanceMaturity + d);
  } else if (focus === "reliability") {
    next.reliabilityMaturity = clamp01(part.reliabilityMaturity + d);
  } else {
    next.partUnderstanding = clamp01(part.partUnderstanding + d);
  }
  return next;
}

export function bumpContextFamiliarity(
  part: PartInstance,
  fleetCarId: string,
  trackId: string,
  amount: number,
): PartInstance {
  const byCar = { ...part.contextFamiliarity };
  const trackMap = { ...(byCar[fleetCarId] ?? {}) };
  trackMap[trackId] = clamp01((trackMap[trackId] ?? 0) + amount);
  byCar[fleetCarId] = trackMap;
  return { ...part, contextFamiliarity: byCar };
}
