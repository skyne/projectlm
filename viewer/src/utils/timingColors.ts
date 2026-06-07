import type { CarSnapshot } from "../ws/protocol";

const TIME_EPS = 0.0005;

export function timesEqual(a: number, b: number): boolean {
  return a > 0 && b > 0 && Math.abs(a - b) <= TIME_EPS;
}

export function collectSectorTimes(
  snapshots: CarSnapshot[],
  sectorCount: number,
): number[][] {
  const perSector: number[][] = Array.from({ length: sectorCount }, () => []);
  for (const snap of snapshots) {
    for (const lap of snap.lapHistory ?? []) {
      lap.sectorTimes.forEach((time, index) => {
        if (time > 0 && index < sectorCount) perSector[index].push(time);
      });
    }
    (snap.currentLapSectorTimes ?? []).forEach((time, index) => {
      if (time > 0 && index < sectorCount) perSector[index].push(time);
    });
  }
  return perSector;
}

export function sessionSectorBests(
  snapshots: CarSnapshot[],
  sectorCount: number,
): number[] {
  return collectSectorTimes(snapshots, sectorCount).map((times) => bestOf(times));
}

export function personalSectorBests(
  snap: CarSnapshot,
  sectorCount: number,
): number[] {
  const times = collectSectorTimes([snap], sectorCount);
  return times.map((sectorTimes) => bestOf(sectorTimes));
}

export function sessionBestLap(snapshots: CarSnapshot[]): number {
  return bestOf(
    snapshots
      .map((snap) => snap.bestLapTime ?? 0)
      .filter((time) => time > 0),
  );
}

export function timingCompareClass(
  time: number,
  personalBest: number,
  sessionBest: number,
): string {
  if (!Number.isFinite(time) || time <= 0) return "";
  if (sessionBest > 0 && timesEqual(time, sessionBest)) return "timing-absolute";
  if (personalBest > 0 && timesEqual(time, personalBest)) return "timing-personal";
  return "";
}

function bestOf(times: number[]): number {
  if (times.length === 0) return 0;
  return Math.min(...times);
}
