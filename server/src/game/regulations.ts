/** Season regulation sets — BoP file paths per championship phase (server-side). */

export interface RegulationSet {
  id: string;
  label: string;
  classRulesPath: string;
  /** Power cap deltas applied when generating runtime class rules (future). */
  powerCapDelta?: Record<string, number>;
}

const BASE = "configs/class_rules.txt";

export const REGULATION_SETS: RegulationSet[] = [
  { id: "season_start", label: "Season opener", classRulesPath: BASE },
  {
    id: "mid_season",
    label: "Mid-season BoP",
    classRulesPath: "configs/class_rules_midseason.txt",
  },
];

export function regulationForRound(round: number): RegulationSet {
  if (round >= 5) return REGULATION_SETS[1] ?? REGULATION_SETS[0];
  return REGULATION_SETS[0];
}
