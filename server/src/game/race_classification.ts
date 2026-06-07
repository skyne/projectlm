import type { CarSnapshot } from "../ws_protocol";

/**
 * FIA WEC classifies cars that cover ≥70% of the **overall** winner's distance.
 * This sim uses 75% of the **class leader** — stricter per-class and easier to reason
 * about in multi-class endurance.
 */
export const CLASS_MIN_DISTANCE_FRACTION = 0.75;

/** FIA WEC sporting regulation reference (overall winner distance). */
export const WEC_OVERALL_MIN_DISTANCE_FRACTION = 0.7;

export function raceDistanceMeters(
  snap: Pick<CarSnapshot, "lap" | "distance">,
  lapLength: number,
): number {
  if (lapLength <= 0) return 0;
  const completedLaps = Math.max(0, (snap.lap ?? 1) - 1);
  return completedLaps * lapLength + Math.max(0, snap.distance ?? 0);
}

export function applyRaceClassification(
  snapshots: CarSnapshot[],
  lapLength: number,
  options?: { minClassFraction?: number; enabled?: boolean },
): CarSnapshot[] {
  if (options?.enabled === false || lapLength <= 0 || snapshots.length === 0) {
    return snapshots;
  }
  const minFrac = options?.minClassFraction ?? CLASS_MIN_DISTANCE_FRACTION;

  const classLeaderDistance: Record<string, number> = {};
  for (const snap of snapshots) {
    const dist = raceDistanceMeters(snap, lapLength);
    const prev = classLeaderDistance[snap.classId] ?? 0;
    if (dist > prev) classLeaderDistance[snap.classId] = dist;
  }

  return snapshots.map((snap) => {
    if (snap.retired) return snap;
    const leaderDist = classLeaderDistance[snap.classId] ?? 0;
    if (leaderDist <= 0) return snap;
    const dist = raceDistanceMeters(snap, lapLength);
    if (dist + 1e-6 >= leaderDist * minFrac) return snap;
    const pct = Math.round((dist / leaderDist) * 100);
    return {
      ...snap,
      retired: true,
      retireReason: `Not classified (${pct}% of class leader distance, need ${Math.round(minFrac * 100)}%)`,
    };
  });
}

export function snapshotsToRaceResults(
  snapshots: CarSnapshot[],
): Array<{
  entryId: string;
  teamName: string;
  carNumber: string;
  classId: string;
  position: number;
  bestLapTime: number;
  driverName?: string;
  retired?: boolean;
  retireReason?: string;
}> {
  return snapshots.map((s) => ({
    entryId: s.entryId,
    teamName: s.teamName,
    carNumber: s.carNumber,
    classId: s.classId,
    position: s.racePosition,
    bestLapTime: s.bestLapTime ?? 0,
    driverName: s.driverName,
    retired: s.retired,
    retireReason: s.retireReason,
  }));
}
