import {
  mirrorPolylineEdits,
  recomputeLapLength,
} from "@server/game/track_exporter";
import {
  canonicalPolyline,
  type PitLanePointJson,
  type PitLanePointRole,
  type TrackJson,
  type TrackPoint3,
} from "@server/game/track_json";

export type EditorSurface = "layout" | "pit";
export type EditorTool = "select" | "add";

export function getEditablePolyline(track: TrackJson): TrackPoint3[] {
  return canonicalPolyline(track).map((p) => ({
    x: p.x,
    y: p.y ?? 0,
    z: p.z,
  }));
}

export function applyPolyline(track: TrackJson, points: TrackPoint3[]): TrackJson {
  const polylines = mirrorPolylineEdits(points);
  const next: TrackJson = {
    ...track,
    ...polylines,
  };
  return { ...next, lap_length: recomputeLapLength(next) };
}

export function movePolylineVertex(
  track: TrackJson,
  index: number,
  x: number,
  z: number,
  snapM = 0,
): TrackJson {
  const points = getEditablePolyline(track);
  if (index < 0 || index >= points.length) return track;
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  points[index] = { ...points[index], x: snap(x), z: snap(z) };
  return applyPolyline(track, points);
}

export function deletePolylineVertex(track: TrackJson, index: number): TrackJson {
  const closed = track.closed ?? true;
  const minPoints = closed ? 3 : 2;
  const points = getEditablePolyline(track);
  if (points.length <= minPoints || index < 0 || index >= points.length) {
    return track;
  }
  points.splice(index, 1);
  return applyPolyline(track, points);
}

export interface NearestSegmentHit {
  segmentIndex: number;
  distanceM: number;
  closest: { x: number; z: number };
}

export function findNearestSegment(
  points: Array<{ x: number; z: number }>,
  x: number,
  z: number,
  closed: boolean,
): NearestSegmentHit | null {
  if (points.length < 2) return null;
  const limit = closed ? points.length : points.length - 1;
  let best: NearestSegmentHit | null = null;

  for (let i = 0; i < limit; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const t = lenSq > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / lenSq : 0;
    const clamped = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * clamped;
    const cz = a.z + abz * clamped;
    const dist = Math.hypot(x - cx, z - cz);
    if (!best || dist < best.distanceM) {
      best = {
        segmentIndex: i,
        distanceM: dist,
        closest: { x: cx, z: cz },
      };
    }
  }
  return best;
}

export function insertVertexOnSegment(
  track: TrackJson,
  segmentIndex: number,
  x: number,
  z: number,
  snapM = 0,
): TrackJson {
  const points = getEditablePolyline(track);
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  const insertAt = segmentIndex + 1;
  points.splice(insertAt, 0, { x: snap(x), y: 0, z: snap(z) });
  return applyPolyline(track, points);
}

/** Indices to show as draggable handles (decimate dense polylines). */
export function getEditablePitPolyline(track: TrackJson): PitLanePointJson[] {
  return (track.pit_lane?.polyline ?? []).map((p) => ({
    x: p.x,
    y: p.y ?? 0,
    z: p.z,
    role: p.role,
  }));
}

export function applyPitPolyline(track: TrackJson, points: PitLanePointJson[]): TrackJson {
  const pit_lane = {
    ...track.pit_lane,
    polyline: points,
  };
  return { ...track, pit_lane };
}

export function movePitVertex(
  track: TrackJson,
  index: number,
  x: number,
  z: number,
  snapM = 0,
): TrackJson {
  const points = getEditablePitPolyline(track);
  if (index < 0 || index >= points.length) return track;
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  points[index] = { ...points[index], x: snap(x), z: snap(z) };
  return applyPitPolyline(track, points);
}

export function setPitVertexRole(
  track: TrackJson,
  index: number,
  role: PitLanePointRole,
): TrackJson {
  const points = getEditablePitPolyline(track);
  if (index < 0 || index >= points.length) return track;
  points[index] = { ...points[index], role };
  return applyPitPolyline(track, points);
}

export function deletePitVertex(track: TrackJson, index: number): TrackJson {
  const points = getEditablePitPolyline(track);
  if (points.length <= 2 || index < 0 || index >= points.length) return track;
  points.splice(index, 1);
  return applyPitPolyline(track, points);
}

export function insertPitVertexOnSegment(
  track: TrackJson,
  segmentIndex: number,
  x: number,
  z: number,
  snapM = 0,
  role: PitLanePointRole = "waypoint",
): TrackJson {
  const points = getEditablePitPolyline(track);
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  const insertAt = segmentIndex + 1;
  points.splice(insertAt, 0, { x: snap(x), y: 0, z: snap(z), role });
  return applyPitPolyline(track, points);
}

export function pitHandleIndices(pointCount: number, maxHandles = 200): number[] {
  return handleIndices(pointCount, maxHandles);
}

export function handleIndices(pointCount: number, maxHandles = 400): number[] {
  if (pointCount <= maxHandles) {
    return Array.from({ length: pointCount }, (_, i) => i);
  }
  const step = Math.ceil(pointCount / maxHandles);
  const indices: number[] = [];
  for (let i = 0; i < pointCount; i += step) indices.push(i);
  if (indices[indices.length - 1] !== pointCount - 1) {
    indices.push(pointCount - 1);
  }
  return indices;
}
