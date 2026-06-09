import type { CarSnapshot, SessionKind } from "../ws/protocol";
import { sortByTiming } from "./weekendSessions";

export type GapScope = "overall" | "class";

/** Joint / private tests often span classes — show every entry on the rail. */
export function effectiveLeaderboardGapScope(
  gapScope: GapScope,
  sessionKind?: SessionKind,
): GapScope {
  return sessionKind === "private_test" ? "overall" : gapScope;
}

function compareRacePosition(a: CarSnapshot, b: CarSnapshot): number {
  const diff = a.racePosition - b.racePosition;
  if (diff !== 0) return diff;
  return a.entryId.localeCompare(b.entryId);
}

export function isSafetyCarSnapshot(snap: CarSnapshot): boolean {
  return snap.entryId === "safety-car";
}

/** One snapshot per entryId — last tick wins if duplicates appear. */
export function dedupeSnapshotsByEntryId(snapshots: CarSnapshot[]): CarSnapshot[] {
  const byId = new Map<string, CarSnapshot>();
  for (const snap of snapshots) {
    if (isSafetyCarSnapshot(snap)) continue;
    byId.set(snap.entryId, snap);
  }
  return [...byId.values()];
}

function resolveClassId(
  snapshots: CarSnapshot[],
  playerEntryId: string,
  managedEntryIds: string[] = [],
): string | undefined {
  for (const entryId of [playerEntryId, ...managedEntryIds]) {
    const classId = snapshots.find((s) => s.entryId === entryId)?.classId;
    if (classId) return classId;
  }
  return undefined;
}

export function orderLeaderboardBoard(
  snapshots: CarSnapshot[],
  options: {
    timingMode: boolean;
    gapScope: GapScope;
    playerEntryId: string;
    managedEntryIds?: string[];
  },
): CarSnapshot[] {
  const { timingMode, gapScope, playerEntryId, managedEntryIds = [] } = options;
  const board = dedupeSnapshotsByEntryId(snapshots);

  if (timingMode) {
    const sorted = sortByTiming(board);
    if (gapScope === "class") {
      const classId = resolveClassId(sorted, playerEntryId, managedEntryIds);
      return classId ? sorted.filter((s) => s.classId === classId) : sorted;
    }
    return sorted;
  }

  if (gapScope === "class") {
    const classId = resolveClassId(board, playerEntryId, managedEntryIds);
    const pool = classId ? board.filter((s) => s.classId === classId) : board;
    // Same-class order matches overall race order — consistent with live timing.
    return [...pool].sort(compareRacePosition);
  }

  return [...board].sort(compareRacePosition);
}

export function uniqueEntryIds(snapshots: CarSnapshot[]): string[] {
  return [...new Set(snapshots.map((s) => s.entryId))];
}
