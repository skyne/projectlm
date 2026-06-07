import type { CalendarEventPayload, MetaStatePayload } from "../ws/protocol";

export function scoringCalendarEvents(
  calendar: CalendarEventPayload[],
): CalendarEventPayload[] {
  return calendar.filter(
    (e) => e.eventType !== "test" && e.format !== "test",
  );
}

/** True when every scoring round is done — works even if server meta flag is stale. */
export function isSeasonFinished(meta: MetaStatePayload): boolean {
  if (meta.seasonComplete) return true;
  const scoring = scoringCalendarEvents(meta.calendar);
  return scoring.length > 0 && scoring.every((e) => e.completed);
}
