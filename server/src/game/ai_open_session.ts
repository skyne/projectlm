import type { CarSnapshot, WeekendSessionType } from "../ws_protocol";

export interface AiOpenSessionContext {
  raceTime: number;
  weekendSessionType: WeekendSessionType;
}

/** Staggered garage release for AI entries during practice/qualifying. */
export function tickAiGarageRelease(
  snapshots: CarSnapshot[],
  managedEntryIds: Set<string>,
  ctx: AiOpenSessionContext,
  submitCommand: (entryId: string, command: string) => boolean,
): void {
  if (ctx.weekendSessionType !== "practice" && ctx.weekendSessionType !== "qualifying") {
    return;
  }

  for (const snap of snapshots) {
    if (managedEntryIds.has(snap.entryId)) continue;
    if (!snap.inGarage || snap.retired) continue;

    const seed = hashEntry(snap.entryId);
    const minDelay =
      ctx.weekendSessionType === "qualifying" ? 25 + (seed % 90) : 45 + (seed % 420);
    const classBias =
      snap.classId === "Hypercar" ? -12 : snap.classId === "LMGT3" ? 18 : 0;
    const releaseAt = Math.max(15, minDelay + classBias);

    if (ctx.raceTime >= releaseAt) {
      submitCommand(snap.entryId, "release");
    }
  }
}

function hashEntry(entryId: string): number {
  let h = 0;
  for (let i = 0; i < entryId.length; i++) {
    h = (h * 31 + entryId.charCodeAt(i)) >>> 0;
  }
  return h;
}
