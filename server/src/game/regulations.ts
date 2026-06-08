/** Season regulation sets — BoP file paths per championship phase (server-side). */

import type { RegulatoryState } from "./negotiations";

export const REGULATORY_ENTITY_ID = "acr";

export interface RegulationSet {
  id: string;
  label: string;
  classRulesPath: string;
  /** Power cap deltas applied when generating runtime class rules (future). */
  powerCapDelta?: Record<string, number>;
}

export type RuleProposalKind = "exception" | "rule_vote";

export interface RuleChangeProposal {
  id: string;
  label: string;
  description: string;
  kind: RuleProposalKind;
  petitionFee: number;
  targetClassId?: string;
  powerCapDelta?: number;
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

export const RULE_CHANGE_PROPOSALS: RuleChangeProposal[] = [
  {
    id: "bop_hypercar_relief",
    label: "Hypercar power cap relief",
    description:
      "Request a temporary +2% power cap for Hypercar (stub — runtime BoP hook pending).",
    kind: "exception",
    petitionFee: 400_000,
    targetClassId: "Hypercar",
    powerCapDelta: 0.02,
  },
  {
    id: "private_test_waiver",
    label: "Extra private test day",
    description:
      "Petition for an additional private test session (calendar/sim hook pending).",
    kind: "exception",
    petitionFee: 250_000,
    targetClassId: "Hypercar",
  },
  {
    id: "vote_lmp2_weight_shift",
    label: "LMP2 minimum weight adjustment",
    description: "Initiate a grid vote on LMP2 weight regulations for next season.",
    kind: "rule_vote",
    petitionFee: 150_000,
    targetClassId: "LMP2",
  },
  {
    id: "vote_gt3_bop_review",
    label: "LMGT3 BoP review",
    description: "Call a championship vote to review LMGT3 balance of performance.",
    kind: "rule_vote",
    petitionFee: 120_000,
    targetClassId: "LMGT3",
  },
];

export function ruleProposalById(id: string): RuleChangeProposal | undefined {
  return RULE_CHANGE_PROPOSALS.find((p) => p.id === id);
}

export function regulationForRound(round: number): RegulationSet {
  if (round >= 5) return REGULATION_SETS[1] ?? REGULATION_SETS[0];
  return REGULATION_SETS[0];
}

export function defaultRegulatoryState(currentRound: number): RegulatoryState {
  const reg = regulationForRound(currentRound);
  return {
    activeRegulationId: reg.id,
    pendingVotes: [],
    grantedExceptions: [],
  };
}

/** Stub — merge granted exceptions into runtime regulation deltas when sim bridge supports it. */
export function effectivePowerCapDelta(
  regulatory: RegulatoryState | undefined,
  classId: string,
  currentRound: number,
): number {
  let delta = 0;
  for (const exc of regulatory?.grantedExceptions ?? []) {
    if (exc.classId !== classId) continue;
    if (currentRound > exc.expiresAtRound) continue;
    delta += exc.powerCapDelta;
  }
  return delta;
}
