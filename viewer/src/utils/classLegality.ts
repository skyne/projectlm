import type { ClassInfoPayload, PartOptionPayload } from "../ws/protocol";
import type { PartSlot } from "./carStats";

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
