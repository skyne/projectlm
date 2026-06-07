import type {
  CalendarEventPayload,
  CarSnapshot,
  MetaStatePayload,
  RaceCompletePayload,
  WeekendSessionType,
} from "../ws/protocol";
import { isSeasonFinished } from "./seasonState";

export function isTimingSession(type?: WeekendSessionType): boolean {
  return type === "practice" || type === "qualifying";
}

export function sortByTiming(snapshots: CarSnapshot[]): CarSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const aHas = (a.bestLapTime ?? 0) > 0;
    const bHas = (b.bestLapTime ?? 0) > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.bestLapTime !== b.bestLapTime) {
      return (a.bestLapTime ?? 0) - (b.bestLapTime ?? 0);
    }
    return (a.lastLapTime ?? 0) - (b.lastLapTime ?? 0);
  });
}

export const WEEKEND_STEPS: Array<{
  type: WeekendSessionType;
  label: string;
  short: string;
}> = [
  { type: "practice", label: "Free Practice", short: "FP" },
  { type: "qualifying", label: "Qualifying", short: "Quali" },
  { type: "race", label: "Race", short: "Race" },
];

export function weekendScheduleActive(event?: CalendarEventPayload): boolean {
  if (!event) return false;
  const lower = (event.format ?? "").trim().toLowerCase();
  return event.eventType !== "test" && lower !== "test";
}

export function nextWeekendSession(
  completed: WeekendSessionType[],
): WeekendSessionType | null {
  for (const step of WEEKEND_STEPS) {
    if (!completed.includes(step.type)) return step.type;
  }
  return null;
}

export function resolveNextSession(meta: MetaStatePayload): WeekendSessionType | null {
  if (isSeasonFinished(meta)) return null;
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed || !weekendScheduleActive(current)) return null;
  const completed =
    meta.weekendProgress?.round === meta.currentRound
      ? meta.weekendProgress.completedSessions
      : [];
  return nextWeekendSession(completed);
}

export function sessionDurationLabel(
  sessionType: WeekendSessionType,
  raceFormat?: string,
): string {
  if (sessionType === "practice") return "60 min";
  if (sessionType === "qualifying") return "15 min";
  return raceFormat ?? "Race";
}

export function startSessionButtonLabel(
  sessionType: WeekendSessionType | null,
  isTest: boolean,
): string {
  if (isTest || !sessionType) return "Prepare & Start";
  switch (sessionType) {
    case "practice":
      return "Start Free Practice";
    case "qualifying":
      return "Start Qualifying";
    case "race":
      return "Prepare for Race";
  }
}

/** Infer the next weekend step after a session finishes (client fallback). */
export function nextSessionAfter(
  completed: WeekendSessionType | undefined,
): WeekendSessionType | null {
  if (completed === "practice") return "qualifying";
  if (completed === "qualifying") return "race";
  return null;
}

export function continueSessionButtonLabel(
  next: WeekendSessionType | null,
): string {
  if (!next) return "Continue Championship";
  switch (next) {
    case "practice":
      return "Start Free Practice";
    case "qualifying":
      return "Continue to Qualifying";
    case "race":
      return "Prepare for Race";
  }
}

/** Primary CTA when a weekend has no further sessions (race or test complete). */
export function returnToHqButtonLabel(sessionType: WeekendSessionType): string {
  return sessionType === "race" ? "Back to Headquarters" : "Continue Championship";
}

/** Resolve the next weekend step after a session ends (client-side). */
export function resolvePendingNextSession(
  payload: RaceCompletePayload,
  sessionType: WeekendSessionType,
  meta?: MetaStatePayload | null,
): WeekendSessionType | null {
  if (sessionType === "race") return null;
  if (payload.nextWeekendSession !== undefined) {
    return payload.nextWeekendSession;
  }
  return nextSessionAfter(sessionType) ?? (meta ? resolveNextSession(meta) : null);
}

export function sessionLabel(sessionType?: WeekendSessionType): string {
  const step = WEEKEND_STEPS.find((s) => s.type === sessionType);
  return step?.label ?? "Race";
}

export function sessionShortLabel(sessionType?: WeekendSessionType): string {
  const step = WEEKEND_STEPS.find((s) => s.type === sessionType);
  return step?.short ?? "Race";
}

/** Badge on the post-session results overlay. */
export function sessionCompleteBadge(sessionType: WeekendSessionType): string {
  return `${sessionLabel(sessionType)} Complete`;
}

/** Main heading on the post-session results overlay. */
export function sessionResultsTitle(sessionType: WeekendSessionType): string {
  switch (sessionType) {
    case "practice":
      return "Free Practice Results";
    case "qualifying":
      return "Qualifying Classification";
    case "race":
      return "Endurance Classification";
  }
}

/** @deprecated Use sessionResultsTitle — kept for callers migrating gradually. */
export function sessionCompleteTitle(sessionType: WeekendSessionType): string {
  return sessionResultsTitle(sessionType);
}

export function sessionElapsedLabel(sessionType: WeekendSessionType): string {
  return sessionType === "race" ? "Race time" : "Elapsed time";
}

/** Live timing panel title (timetable view + compact leaderboard). */
export function sessionTimingTitle(sessionType?: WeekendSessionType): string {
  if (sessionType === "practice") return "Free Practice Timing";
  if (sessionType === "qualifying") return "Qualifying Timing";
  return "Live Timing";
}

/** Standings column title during a race session. */
export function sessionStandingsTitle(sessionType?: WeekendSessionType): string {
  if (sessionType === "practice") return "Free Practice Standings";
  if (sessionType === "qualifying") return "Qualifying Standings";
  return "Race Standings";
}

export function sessionTelemetrySubtitle(sessionType?: WeekendSessionType): string {
  return `${sessionLabel(sessionType)} · multi-car live data · strategy`;
}

export function sessionMapMetaPrefix(sessionType?: WeekendSessionType): string {
  return sessionLabel(sessionType);
}
