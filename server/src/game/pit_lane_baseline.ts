import type { TrackJson, TrackPoint3 } from "./track_json";

export type PitLanePointRole = "entry" | "box" | "exit" | "waypoint";

export interface PitLanePointJson extends TrackPoint3 {
  role: PitLanePointRole;
}

const SAMPLE_STEP_M = 12;

function vecLength(dx: number, dy: number, dz: number): number {
  return Math.hypot(dx, dy, dz);
}

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = vecLength(x, y, z);
  if (len < 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: x / len, y: y / len, z: z / len };
}

/** Chord-length polyline along control points (matches C++ load scaling). */
function polylineArcLength(points: TrackPoint3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += vecLength(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

function sampleTrackPoseAtLapDistance(
  points: TrackPoint3[],
  closed: boolean,
  lapLength: number,
  lapDistance: number,
): { x: number; y: number; z: number; tx: number; tz: number } {
  const chordLen = Math.max(polylineArcLength(points), 1);
  const scale = lapLength > 0 ? lapLength / chordLen : 1;
  let target = lapDistance / scale;
  if (closed && lapLength > 0) {
    target = (((lapDistance % lapLength) + lapLength) % lapLength) / scale;
  }
  const limit = closed ? points.length : points.length - 1;
  let accum = 0;
  for (let i = 0; i < limit; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const seg = vecLength(b.x - a.x, b.y - a.y, b.z - a.z);
    if (accum + seg >= target || i === limit - 1) {
      const u = seg > 0 ? Math.min(1, (target - accum) / seg) : 0;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const z = a.z + (b.z - a.z) * u;
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const t = normalize(tx, 0, tz);
      return { x, y, z, tx: t.x, tz: t.z };
    }
    accum += seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, z: last.z, tx: 0, tz: 1 };
}

/** Forward distance along a closed lap from entry_t to exit_t. */
export function pitLaneSpanM(
  lapLength: number,
  entryT: number,
  exitT: number,
  closed: boolean,
): number {
  const entryDist = entryT * lapLength;
  const exitDist = exitT * lapLength;
  if (lapLength <= 0) return 0;
  if (!closed) {
    return exitDist >= entryDist ? exitDist - entryDist : Math.max(0, lapLength - entryDist);
  }
  if (exitDist >= entryDist) return exitDist - entryDist;
  return lapLength - entryDist + exitDist;
}

/** Mirrors C++ GenerateDefaultPitLaneGeometry for JSON migration. */
export function generateDefaultPitLaneFields(track: TrackJson): NonNullable<TrackJson["pit_lane"]> {
  const pit = track.pit_lane ?? {};
  const offsetM = pit.offset_m ?? 10;
  const lapLength = track.lap_length ?? polylineArcLength(track.display_polyline ?? track.control_points ?? []);
  const centerline = track.display_polyline ?? track.control_points ?? [];
  const closed = track.closed ?? true;
  const entryT = pit.entry_t ?? 0.985;
  const exitT = pit.exit_t ?? 0.06;

  const entryDist = entryT * lapLength;
  const pitSpan = pitLaneSpanM(lapLength, entryT, exitT, closed);
  const polyline: PitLanePointJson[] = [];

  for (let d = 0; d <= pitSpan + 1e-6; d += SAMPLE_STEP_M) {
    const along = Math.min(d, pitSpan);
    const pose = sampleTrackPoseAtLapDistance(centerline, closed, lapLength, entryDist + along);
    const perp = normalize(-pose.tz, 0, pose.tx);
    polyline.push({
      x: pose.x + perp.x * offsetM,
      y: pose.y,
      z: pose.z + perp.z * offsetM,
      role: "waypoint",
    });
    if (along >= pitSpan - 1e-6) break;
  }

  if (polyline.length >= 2) {
    polyline[0].role = "entry";
    polyline[polyline.length - 1].role = "exit";
    const boxIdx = Math.round((polyline.length - 1) * 0.48);
    polyline[boxIdx].role = "box";
  }

  let chordTotal = 0;
  let boxChord = 0;
  const boxIdx = Math.round((polyline.length - 1) * 0.48);
  for (let i = 1; i < polyline.length; i++) {
    const seg = vecLength(
      polyline[i].x - polyline[i - 1].x,
      polyline[i].y - polyline[i - 1].y,
      polyline[i].z - polyline[i - 1].z,
    );
    chordTotal += seg;
    if (i <= boxIdx) boxChord = chordTotal;
  }
  const pitLength = chordTotal;
  const boxDistanceM = pitLength > 0 ? boxChord : pitLength * 0.48;

  return {
    width_m: pit.width_m ?? 12,
    offset_m: offsetM,
    merge_lateral_offset: pit.merge_lateral_offset ?? 0.58,
    merge_blend_m: pit.merge_blend_m ?? 80,
    entry_t: entryT,
    exit_t: exitT,
    box_distance_m: boxDistanceM,
    speed_limit_ms: pit.speed_limit_ms ?? 60 / 3.6,
    polyline,
  };
}
