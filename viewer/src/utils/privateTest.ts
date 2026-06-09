import type { MetaStatePayload } from "../ws/protocol";
import { isSeasonFinished } from "./seasonState";
import { weekendScheduleActive } from "./weekendSessions";

export function isRaceWeekendInProgress(meta: MetaStatePayload): boolean {
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed) return false;
  if (!weekendScheduleActive(current)) return false;
  return meta.weekendProgress?.round === meta.currentRound;
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
