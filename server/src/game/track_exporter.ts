import {
  canonicalPolyline,
  ensureAuthoringPolylines,
  stripSynthSurfaceSegments,
  type TrackJson,
  type TrackPoint3,
} from "./track_json";
import { buildTrackGeometry } from "./track_geometry_build";

export function polylineArcLengthM(
  points: Array<{ x: number; z: number }>,
  closed: boolean,
): number {
  if (points.length < 2) return 0;
  let total = 0;
  const limit = closed ? points.length : points.length - 1;
  for (let i = 0; i < limit; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    total += Math.hypot(dx, dz);
  }
  return total;
}

/** True when polyline chord length exceeds stored lap length (sim scales via setTargetLength). */
export function polylineExceedsLapLength(
  points: Array<{ x: number; z: number }>,
  lapLengthM: number,
): boolean {
  if (lapLengthM <= 0 || points.length < 2) return false;
  return polylineArcLengthM(points, false) > lapLengthM * 1.15;
}

const MIN_POINTS_FOR_AUTHORING_DECIMATE = 50;

/**
 * Drop every second point on oversampled closed catalog polylines before authoring
 * inference. Catalog tracks often store ~2× dense control points along the same loop
 * while lap_length is the authoritative sim distance (setTargetLength in the sim).
 */
export function decimateOversampledPolyline(
  polyline: TrackPoint3[],
  lapLengthM: number,
  closed = true,
): TrackPoint3[] {
  if (
    !closed ||
    polyline.length < MIN_POINTS_FOR_AUTHORING_DECIMATE ||
    lapLengthM <= 0
  ) {
    return polyline;
  }
  const flat = polyline.map((p) => ({ x: p.x, z: p.z }));
  if (!polylineExceedsLapLength(flat, lapLengthM)) return polyline;

  const out: TrackPoint3[] = [];
  for (let i = 0; i < polyline.length; i += 2) {
    out.push(polyline[i]);
  }
  const last = polyline[polyline.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail.x - last.x, tail.z - last.z) > 0.01) {
    out.push(last);
  }
  return out.length >= 2 ? out : polyline;
}

export function recomputeLapLength(track: TrackJson): number {
  const poly = canonicalPolyline(track).map((p) => ({ x: p.x, z: p.z }));
  const closed = track.closed ?? true;
  const arc = polylineArcLengthM(poly, closed);
  const existing = track.lap_length;
  if (existing != null && existing > 0 && polylineExceedsLapLength(poly, existing)) {
    return existing;
  }
  return arc;
}

export function prepareTrackForExport(track: TrackJson): TrackJson {
  const withPolylines = ensureAuthoringPolylines(track);
  const lapLength = recomputeLapLength(withPolylines);
  const surfaceProfile = stripSynthSurfaceSegments(withPolylines.surface_profile);
  return {
    ...withPolylines,
    lap_length: lapLength,
    ...(surfaceProfile ? { surface_profile: surfaceProfile } : {}),
  };
}

export function trackJsonToFile(track: TrackJson): string {
  const prepared = prepareTrackForExport(track);
  return `${JSON.stringify(prepared, null, 2)}\n`;
}

export function parseTrackJson(raw: unknown): TrackJson {
  if (!raw || typeof raw !== "object") {
    throw new Error("track must be a JSON object");
  }
  const track = raw as TrackJson;
  if (!track.name || typeof track.name !== "string") {
    throw new Error("track.name is required");
  }
  const poly = canonicalPolyline(track);
  if (poly.length < 2) {
    throw new Error("track needs at least two polyline points");
  }
  return track;
}

export function validateTrackJson(track: TrackJson, fallbackName = "Circuit"): void {
  parseTrackJson(track);
  buildTrackGeometry(track, fallbackName);
}

export function mirrorPolylineEdits(
  points: TrackPoint3[],
): { display_polyline: TrackPoint3[]; control_points: TrackPoint3[] } {
  const normalized = points.map((p) => ({
    x: p.x,
    y: p.y ?? 0,
    z: p.z,
  }));
  return {
    display_polyline: normalized,
    control_points: normalized.map((p) => ({ ...p })),
  };
}
