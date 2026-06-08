import type { ClassInfoPayload, PartOptionPayload } from "../ws/protocol";
import type { PartSlot } from "./carStats";

/** Placeholder hybrid parts with zero deploy — not real ERS options. */
export const NON_HYBRID_PLACEHOLDER_PARTS = new Set([
  "None",
  "NoneLightweight",
  "NoneEndurance",
]);

export function legalPartsForSlot(
  classInfo: ClassInfoPayload | null | undefined,
  slot: PartSlot,
): Set<string> | undefined {
  const list = classInfo?.legalParts?.[slot];
  if (!list?.length) return undefined;
  return new Set(list);
}

export function isPartLegalForClass(
  classInfo: ClassInfoPayload | null | undefined,
  slot: PartSlot,
  partType: string,
): boolean {
  const allowed = legalPartsForSlot(classInfo, slot);
  if (!allowed) return true;
  return allowed.has(partType);
}

export function filterPartsForClass(
  classInfo: ClassInfoPayload | null | undefined,
  slot: PartSlot,
  parts: PartOptionPayload[],
): PartOptionPayload[] {
  const allowed = legalPartsForSlot(classInfo, slot);
  if (!allowed) return parts;
  return parts.filter((p) => allowed.has(p.partType));
}

/** True when the class permits a real hybrid / ERS system (not just "None"). */
export function classAllowsHybrid(
  classInfo: ClassInfoPayload | null | undefined,
): boolean {
  const allowed = legalPartsForSlot(classInfo, "hybrid");
  if (!allowed?.size) return false;
  for (const partType of allowed) {
    if (!NON_HYBRID_PLACEHOLDER_PARTS.has(partType)) return true;
  }
  return false;
}

export function normalizeHybridForClass(
  hybridSystem: string,
  classInfo: ClassInfoPayload | null | undefined,
): string {
  if (!classAllowsHybrid(classInfo)) return "None";
  const allowed = legalPartsForSlot(classInfo, "hybrid");
  if (allowed && !allowed.has(hybridSystem)) {
    if (allowed.has("None")) return "None";
    return [...allowed][0] ?? "None";
  }
  return hybridSystem;
}
