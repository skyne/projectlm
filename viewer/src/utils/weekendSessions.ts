import type {
  CalendarEventPayload,
  CarSnapshot,
  MetaStatePayload,
  WeekendSessionType,
} from "../ws/protocol";

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
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || !weekendScheduleActive(current)) return null;
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

export function sessionCompleteTitle(sessionType: WeekendSessionType): string {
  switch (sessionType) {
    case "practice":
      return "Free Practice Complete";
    case "qualifying":
      return "Qualifying Complete";
    case "race":
      return "Endurance Classification";
  }
}
