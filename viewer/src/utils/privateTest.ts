import type { MetaStatePayload } from "../ws/protocol";
import { isSeasonFinished } from "./seasonState";
import { weekendScheduleActive } from "./weekendSessions";

export function isRaceWeekendInProgress(meta: MetaStatePayload): boolean {
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed) return false;
  if (!weekendScheduleActive(current)) return false;
  return meta.weekendProgress?.round === meta.currentRound;
}

export function activeJointTestingPartners(meta: MetaStatePayload): string[] {
  return (meta.activeAgreements ?? [])
    .filter(
      (agr) =>
        agr.kind === "joint_testing" &&
        agr.partnerTeam &&
        meta.currentRound <= agr.expiresAtRound,
    )
    .map((agr) => agr.partnerTeam!);
}

export function privateTestBonusHint(meta: MetaStatePayload): string | null {
  const partners = activeJointTestingPartners(meta);
  if (!partners.length) return null;
  const pct = Math.min(50, partners.length * 25);
  return `Joint testing +${pct}% XP (${partners.join(", ")})`;
}

export function privateTestBlockedReason(meta: MetaStatePayload): string | null {
  if (!meta.setupComplete) return "Complete team setup first";
  if (isSeasonFinished(meta)) {
    return "Season complete — review results and start the next season";
  }
  if (isRaceWeekendInProgress(meta)) {
    return "Finish the race weekend before scheduling a private test";
  }
  if (!meta.fleet?.length) return "Your team needs at least one car";
  return null;
}

export function canStartPrivateTest(meta: MetaStatePayload): boolean {
  return privateTestBlockedReason(meta) === null;
}
