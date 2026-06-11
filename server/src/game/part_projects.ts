import type { PartInstance } from "./part_instances";
import { advancePartFocus } from "./part_instances";
import { canDevelopCategory, type FacilityState } from "./facilities";

export type PartProjectFocus = "performance" | "reliability" | "understanding";

export interface PartProject {
  partInstanceId: string;
  focus: PartProjectFocus;
  /** R&D points allocated this off-week */
  rdSpent: number;
  budgetSpent: number;
}

export const PART_PROJECT_RD_COST = 12;
export const PART_PROJECT_BUDGET_COST = 75_000;
export const PART_PROJECT_YIELD = 0.08;

export function validatePartProject(
  part: PartInstance | undefined,
  facilities: FacilityState[],
  rdPoints: number,
  budget: number,
  focus: PartProjectFocus,
): string | null {
  if (!part) return "Part not found";
  if (!canDevelopCategory(facilities, part.category)) {
    return `Missing facility for ${part.category} development`;
  }
  if (rdPoints < PART_PROJECT_RD_COST) return "Not enough R&D points";
  if (budget < PART_PROJECT_BUDGET_COST) return "Not enough budget";
  if (focus === "performance" && part.performanceMaturity >= 0.99) {
    return "Performance already at catalog ceiling";
  }
  if (focus === "reliability" && part.reliabilityMaturity >= 0.99) {
    return "Reliability already maxed";
  }
  if (focus === "understanding" && part.partUnderstanding >= 0.99) {
    return "Part understanding already maxed";
  }
  return null;
}

export function applyPartProject(
  part: PartInstance,
  focus: PartProjectFocus,
  engineerSkill = 75,
): PartInstance {
  const skillMult = 0.85 + (engineerSkill / 100) * 0.3;
  const yieldAmt = PART_PROJECT_YIELD * skillMult;
  return advancePartFocus(part, focus, yieldAmt);
}
