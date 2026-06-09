import type { CarSnapshot } from "../ws/protocol";
import { isSafetyCarSnapshot } from "./leaderboardBoard";

/** Render safety car above the field on the track map (last in SVG paint order). */
export function orderSnapshotsForMap(snapshots: CarSnapshot[]): CarSnapshot[] {
  const racers: CarSnapshot[] = [];
  let safetyCar: CarSnapshot | undefined;
  for (const snap of snapshots) {
    if (isSafetyCarSnapshot(snap)) safetyCar = snap;
    else racers.push(snap);
  }
  return safetyCar ? [...racers, safetyCar] : racers;
}
