import type { CalendarEventType } from "../ws_protocol";
import type { GeneratedEntry } from "./grid_generator";

export type WeekendSessionType = "practice" | "qualifying" | "race";

export const WEEKEND_SESSION_ORDER: WeekendSessionType[] = [
  "practice",
  "qualifying",
  "race",
];

/** Sim duration for short weekend sessions (seconds). Race uses calendar format. */
export const SESSION_DURATION_SECONDS: Record<
  Exclude<WeekendSessionType, "race">,
  number
> = {
  practice: 60 * 60,
  qualifying: 15 * 60,
};

export interface QualifyingResult {
  entryId: string;
  classId: string;
  bestLapTime: number;
}

export function appliesWeekendSchedule(
  eventType?: CalendarEventType,
  format?: string,
): boolean {
  const lower = (format ?? "").trim().toLowerCase();
  return eventType !== "test" && lower !== "test";
}

export function nextWeekendSession(
  completed: WeekendSessionType[],
): WeekendSessionType | null {
  for (const step of WEEKEND_SESSION_ORDER) {
    if (!completed.includes(step)) return step;
  }
  return null;
}

export function sessionDisplayLabel(sessionType: WeekendSessionType): string {
  switch (sessionType) {
    case "practice":
      return "Free Practice";
    case "qualifying":
      return "Qualifying";
    case "race":
      return "Race";
  }
}

export function sessionDurationSeconds(
  sessionType: WeekendSessionType,
  raceFormat: string,
  formatToRaceSeconds: (format: string) => number,
): number {
  if (sessionType === "practice") return SESSION_DURATION_SECONDS.practice;
  if (sessionType === "qualifying") return SESSION_DURATION_SECONDS.qualifying;
  return formatToRaceSeconds(raceFormat);
}

export function canStartWeekendSession(
  sessionType: WeekendSessionType,
  completed: WeekendSessionType[],
): string | null {
  if (sessionType === "practice") {
    if (completed.includes("practice")) {
      return "Free practice already completed — restart the session to run again";
    }
    return null;
  }
  if (sessionType === "qualifying") {
    if (!completed.includes("practice")) {
      return "Complete free practice before qualifying";
    }
    if (completed.includes("qualifying")) {
      return "Qualifying already completed — restart the session to run again";
    }
    return null;
  }
  if (!completed.includes("qualifying")) {
    return "Complete qualifying before the race";
  }
  if (completed.includes("race")) {
    return "Race already completed for this round";
  }
  return null;
}

/** Re-grid entries by overall qualifying classification (one car per grid slot). */
export function applyQualifyingGrid(
  entries: GeneratedEntry[],
  qualiResults: QualifyingResult[],
): GeneratedEntry[] {
  if (qualiResults.length === 0) return entries;

  const bestByEntry = new Map(
    qualiResults.map((q) => [q.entryId, q.bestLapTime]),
  );

  const sorted = [...entries].sort((a, b) => {
    const ta = bestByEntry.get(a.entryId) ?? Number.POSITIVE_INFINITY;
    const tb = bestByEntry.get(b.entryId) ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.grid - b.grid;
  });

  return sorted.map((entry, index) => ({ ...entry, grid: index + 1 }));
}

export interface TimingSortable {
  bestLapTime?: number;
  lastLapTime?: number;
}

/** Order practice/qualifying results by best lap (cars without a lap go last). */
export function sortTimingResults<T extends TimingSortable>(results: T[]): T[] {
  return [...results].sort((a, b) => {
    const aHas = (a.bestLapTime ?? 0) > 0;
    const bHas = (b.bestLapTime ?? 0) > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.bestLapTime !== b.bestLapTime) {
      return (a.bestLapTime ?? 0) - (b.bestLapTime ?? 0);
    }
    return (a.lastLapTime ?? 0) - (b.lastLapTime ?? 0);
  });
}

export function collectQualifyingResults(
  snapshots: Array<{
    entryId: string;
    classId: string;
    bestLapTime: number;
  }>,
): QualifyingResult[] {
  return snapshots
    .filter((s) => s.bestLapTime > 0)
    .map((s) => ({
      entryId: s.entryId,
      classId: s.classId,
      bestLapTime: s.bestLapTime,
    }));
}
