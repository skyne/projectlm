/**
 * Gameplay hooks for partnership and regulatory agreements.
 */

import type { MetaStatePayload } from "../ws_protocol";
import type { ActiveAgreement } from "./negotiations";
import { describeActiveAgreement } from "./negotiation_deals";

export const JOINT_TESTING_XP_BONUS_PER_PARTNER = 0.25;
export const JOINT_TESTING_XP_BONUS_CAP = 0.5;

export interface AgreementGameplayStubs {
  /** Nominal joint-testing day credits (progression uses XP multiplier instead). */
  privateTestDayCredits: number;
  /** Part catalog IDs nominally shared via tech-share deals (R&D hook). */
  sharedPartCatalogIds: string[];
}

function activeAgreements(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): ActiveAgreement[] {
  return (meta.activeAgreements ?? []).filter(
    (agr) => currentRound <= agr.expiresAtRound,
  );
}

export function activeJointTestingPartners(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): string[] {
  return activeAgreements(meta, currentRound)
    .filter((agr) => agr.kind === "joint_testing" && agr.partnerTeam)
    .map((agr) => agr.partnerTeam!);
}

/** +25% driver/staff XP per active joint-testing partner (max +50%). */
export function privateTestXpMultiplier(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): number {
  const partners = activeJointTestingPartners(meta, currentRound).length;
  const bonus = Math.min(
    JOINT_TESTING_XP_BONUS_CAP,
    partners * JOINT_TESTING_XP_BONUS_PER_PARTNER,
  );
  return 1 + bonus;
}

export function privateTestBonusHint(meta: MetaStatePayload): string | null {
  const partners = activeJointTestingPartners(meta);
  if (!partners.length) return null;
  const pct = Math.round(
    Math.min(
      JOINT_TESTING_XP_BONUS_CAP,
      partners.length * JOINT_TESTING_XP_BONUS_PER_PARTNER,
    ) * 100,
  );
  return `Joint testing +${pct}% XP (${partners.join(", ")})`;
}

/** Derive gameplay bonuses from active agreements (read-only). */
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

/** Log stub intent when new agreements still lack gameplay hooks. */
export function notifyNewAgreementStubs(agreements: ActiveAgreement[]): string[] {
  const notes: string[] = [];
  for (const agr of agreements) {
    if (!agr.stubPending) continue;
    const note = agr.stubNote ?? describeActiveAgreement(agr);
    notes.push(`[agreements-stub] ${agr.kind}: ${note}`);
  }
  return notes;
}
