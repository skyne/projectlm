/**
 * Gameplay hooks for partnership and regulatory agreements.
 * Stubs until private-test calendar, tech-share R&D, and runtime BoP exist.
 */

import type { ActiveAgreement } from "./negotiations";
import { describeActiveAgreement } from "./negotiation_deals";

export interface AgreementGameplayStubs {
  /** Extra private test sessions unlocked (calendar / sim hook). */
  privateTestDayCredits: number;
  /** Part catalog IDs nominally shared via tech-share deals (R&D hook). */
  sharedPartCatalogIds: string[];
}

/** Derive stub gameplay bonuses from active agreements (read-only). */
export function agreementGameplayFromActive(
  agreements: ActiveAgreement[],
  currentRound: number,
): AgreementGameplayStubs {
  let privateTestDayCredits = 0;
  const sharedPartCatalogIds: string[] = [];

  for (const agr of agreements) {
    if (currentRound > agr.expiresAtRound) continue;
    switch (agr.kind) {
      case "joint_testing":
        privateTestDayCredits += agr.terms.testDays ?? 1;
        break;
      case "tech_share":
        if (agr.terms.techSharePartIds?.length) {
          sharedPartCatalogIds.push(...agr.terms.techSharePartIds);
        }
        break;
      default:
        break;
    }
  }

  return { privateTestDayCredits, sharedPartCatalogIds };
}

/** Log stub intent when new agreements land — wire calendar/R&D/BoP here later. */
export function notifyNewAgreementStubs(agreements: ActiveAgreement[]): string[] {
  const notes: string[] = [];
  for (const agr of agreements) {
    if (!agr.stubPending) continue;
    const note = agr.stubNote ?? describeActiveAgreement(agr);
    notes.push(`[agreements-stub] ${agr.kind}: ${note}`);
  }
  return notes;
}
