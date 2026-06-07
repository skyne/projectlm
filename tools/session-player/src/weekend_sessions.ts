/** Client mirror of viewer/src/utils/weekendSessions.ts */
import type { MetaStatePayload } from "./protocol.js";

export type WeekendSessionType = "practice" | "qualifying" | "race";

export function isTimingSession(type?: WeekendSessionType): boolean {
  return type === "practice" || type === "qualifying";
}

export function nextWeekendSession(
  completed: WeekendSessionType[],
): WeekendSessionType | null {
  const order: WeekendSessionType[] = ["practice", "qualifying", "race"];
  for (const step of order) {
    if (!completed.includes(step)) return step;
  }
  return null;
}

export function resolveNextSession(meta: MetaStatePayload): WeekendSessionType | null {
  const current = meta.calendar?.find((e) => e.round === meta.currentRound);
  if (!current) return null;
  const lower = (current.format ?? "").trim().toLowerCase();
  if (current.eventType === "test" || lower === "test") return null;
  const completed =
    meta.weekendProgress?.round === meta.currentRound
      ? meta.weekendProgress.completedSessions
      : [];
  return nextWeekendSession(completed);
}

export function sessionTargetSeconds(
  type: WeekendSessionType,
  raceFormat?: string,
): number {
  if (type === "practice") return 60 * 60;
  if (type === "qualifying") return 15 * 60;
  const fmt = (raceFormat ?? "").trim().toLowerCase();
  if (fmt === "6h") return 6 * 3600;
  if (fmt === "24h") return 24 * 3600;
  if (fmt === "8h") return 8 * 3600;
  if (fmt === "1812km") return 10 * 3600;
  return 6 * 3600;
}
