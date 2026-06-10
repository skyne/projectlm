import type { TrackGeometryPayload } from "../ws/protocol";

function pointsEqual(
  a: Array<{ x: number; z: number }>,
  b: Array<{ x: number; z: number }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].z !== b[i].z) return false;
  }
  return true;
}

function labelsEqual(
  a: TrackGeometryPayload["mapLabels"],
  b: TrackGeometryPayload["mapLabels"],
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const la = left[i];
    const lb = right[i];
    if (
      la.text !== lb.text ||
      la.x !== lb.x ||
      la.z !== lb.z ||
      la.anchor !== lb.anchor
    ) {
      return false;
    }
  }
  return true;
}

/** True when two geometry payloads would draw the same circuit map. */
export function trackGeometryEqual(
  a: TrackGeometryPayload,
  b: TrackGeometryPayload,
): boolean {
  if (a.name !== b.name || a.lapLength !== b.lapLength || a.closed !== b.closed) {
    return false;
  }
  if (!pointsEqual(a.polyline, b.polyline)) return false;
  if (a.sectors.length !== b.sectors.length) return false;
  for (let i = 0; i < a.sectors.length; i++) {
    const sa = a.sectors[i];
    const sb = b.sectors[i];
    if (
      sa.name !== sb.name ||
      sa.startT !== sb.startT ||
      sa.endT !== sb.endT ||
      sa.labelX !== sb.labelX ||
      sa.labelZ !== sb.labelZ
    ) {
      return false;
    }
  }
  if (a.defaultWidthM !== b.defaultWidthM) return false;
  if (a.surfaceDefaults?.vergeWidthM !== b.surfaceDefaults?.vergeWidthM) return false;
  const aSurf = a.surfaceProfile ?? [];
  const bSurf = b.surfaceProfile ?? [];
  if (aSurf.length !== bSurf.length) return false;
  for (let i = 0; i < aSurf.length; i++) {
    const sa = aSurf[i];
    const sb = bSurf[i];
    if (
      sa.startT !== sb.startT ||
      sa.endT !== sb.endT ||
      sa.side !== sb.side ||
      sa.surface !== sb.surface ||
      sa.widthM !== sb.widthM ||
      sa.widthStartM !== sb.widthStartM ||
      sa.widthEndM !== sb.widthEndM ||
      sa.innerOffsetM !== sb.innerOffsetM ||
      sa.envelope !== sb.envelope ||
      sa.variant !== sb.variant ||
      sa.gripMultiplier !== sb.gripMultiplier
    ) {
      return false;
    }
  }
  return labelsEqual(a.mapLabels, b.mapLabels);
}
