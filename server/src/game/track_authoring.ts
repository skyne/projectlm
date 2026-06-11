import {
  decimateOversampledPolyline,
  mirrorPolylineEdits,
  recomputeLapLength,
} from "./track_exporter";
import {
  compilePolylineFromAuthoring,
  douglasPeuckerIndices,
  inferCornerTurnPairs,
  inferTurnMidpoints,
  interiorAngleDeg,
} from "./polyline_authoring";
import {
  canonicalPolyline,
  type PolylineAuthoringNode,
  type TrackAuthoring,
  type TrackAuthoringSegment,
  type TrackJson,
  type TrackPoint3,
  type TrackWidthSegmentJson,
} from "./track_json";

export function compileTrackAuthoring(
  authoring: TrackAuthoring,
  closed: boolean,
): TrackPoint3[] {
  return compilePolylineFromAuthoring(authoring.nodes, closed);
}

export function ensureTrackAuthoringSegments(
  authoring: TrackAuthoring,
): TrackAuthoringSegment[] {
  const count = Math.max(0, authoring.nodes.length - 1);
  const existing = authoring.segments ?? [];
  const segments: TrackAuthoringSegment[] = [];
  for (let i = 0; i < count; i++) {
    segments.push(existing[i] ?? {});
  }
  return segments;
}

/** Rotate closed-circuit authoring so start/finish node is index 0 (lap t=0). */
export function rotateAuthoringToStartFinish(authoring: TrackAuthoring): TrackAuthoring {
  const nodes = authoring.nodes;
  if (nodes.length < 2) return authoring;

  let sfIdx = nodes.findIndex((n) => n.start_finish);
  if (sfIdx < 0) sfIdx = 0;

  const rotatedNodes =
    sfIdx === 0
      ? nodes.map((n, i) => ({ ...n, start_finish: i === 0 }))
      : [...nodes.slice(sfIdx), ...nodes.slice(0, sfIdx)].map((n, i) => ({
          ...n,
          start_finish: i === 0,
        }));

  const segs = ensureTrackAuthoringSegments(authoring);
  const rotatedSegments =
    sfIdx === 0 || segs.length === 0
      ? segs
      : [...segs.slice(sfIdx), ...segs.slice(0, sfIdx)];

  return { nodes: rotatedNodes, segments: rotatedSegments };
}

export function projectPointOnCompiledPolyline(
  polyline: TrackPoint3[],
  closed: boolean,
  lapLength: number,
  x: number,
  z: number,
): { t: number; distanceM: number } {
  if (polyline.length < 2) {
    return { t: 0, distanceM: Infinity };
  }

  const limit = closed ? polyline.length : polyline.length - 1;
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestU = 0;

  for (let i = 0; i < limit; i++) {
    const a = polyline[i];
    const b = polyline[(i + 1) % polyline.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const u = lenSq > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / lenSq : 0;
    const clamped = Math.max(0, Math.min(1, u));
    const cx = a.x + abx * clamped;
    const cz = a.z + abz * clamped;
    const d = Math.hypot(x - cx, z - cz);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestU = clamped;
    }
  }

  let chord = 0;
  for (let i = 0; i < bestSeg; i++) {
    const a = polyline[i];
    const b = polyline[(i + 1) % polyline.length];
    chord += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const a = polyline[bestSeg];
  const b = polyline[(bestSeg + 1) % polyline.length];
  chord += Math.hypot(b.x - a.x, b.z - a.z) * bestU;

  let totalChord = 0;
  for (let i = 0; i < limit; i++) {
    const pa = polyline[i];
    const pb = polyline[(i + 1) % polyline.length];
    totalChord += Math.hypot(pb.x - pa.x, pb.z - pa.z);
  }

  const scale = lapLength > 0 && totalChord > 0 ? lapLength / totalChord : 1;
  const distanceM = chord * scale;
  const t = lapLength > 0 ? (distanceM / lapLength) % 1 : 0;
  return { t, distanceM };
}

function sampleWidthProfileAtT(
  profile: TrackWidthSegmentJson[] | undefined,
  t: number,
  fallback: number,
): number {
  if (!profile?.length) return fallback;
  const norm = ((t % 1) + 1) % 1;
  for (const seg of profile) {
    if (norm >= seg.start_t && norm <= seg.end_t) return seg.width_m;
  }
  return fallback;
}

function authoringHasWidthOverrides(authoring: TrackAuthoring, track: TrackJson): boolean {
  if (authoring.nodes.some((n) => n.width_m != null)) return true;
  if (authoring.segments?.some((s) => s.width_m != null)) return true;
  return (track.width_profile?.length ?? 0) > 0;
}

function pushWidthSpan(
  out: TrackWidthSegmentJson[],
  startT: number,
  endT: number,
  widthM: number,
): void {
  const w = Math.max(1, widthM);
  const last = out[out.length - 1];
  if (last && Math.abs(last.width_m - w) < 1e-6 && Math.abs(last.end_t - startT) < 1e-6) {
    last.end_t = endT;
    return;
  }
  out.push({ start_t: startT, end_t: endT, width_m: w });
}

export function buildWidthProfileFromAuthoring(track: TrackJson): TrackWidthSegmentJson[] | undefined {
  const authoring = track.authoring;
  if (!authoring?.nodes?.length) return undefined;
  if (!authoringHasWidthOverrides(authoring, track)) return undefined;

  const closed = track.closed ?? true;
  const compiled = compileTrackAuthoring(authoring, closed);
  const lapLength = track.lap_length ?? recomputeLapLength(track);
  if (lapLength <= 0 || compiled.length < 2) return undefined;

  const defaultW = track.track_width_m ?? 12;
  const segments = ensureTrackAuthoringSegments(authoring);
  const nodes = authoring.nodes;
  const profile: TrackWidthSegmentJson[] = [];

  const spanCount = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < spanCount; i++) {
    const next = i + 1;
    const node = nodes[i];
    const endNode = nodes[next % nodes.length];
    const seg = segments[i];
    // Width is defined at the destination node (width "at" node N applies on approach).
    const widthM =
      endNode.width_m ?? node.width_m ?? seg?.width_m ?? defaultW;
    const start = projectPointOnCompiledPolyline(compiled, closed, lapLength, node.x, node.z).t;
    const end = projectPointOnCompiledPolyline(
      compiled,
      closed,
      lapLength,
      endNode.x,
      endNode.z,
    ).t;

    if (closed && end <= start && i < spanCount - 1) {
      pushWidthSpan(profile, start, 1, widthM);
      if (end > 0) pushWidthSpan(profile, 0, end, widthM);
    } else if (closed && i === spanCount - 1) {
      pushWidthSpan(profile, start, 1, widthM);
      if (end > 0 && end < 1) pushWidthSpan(profile, 0, end, widthM);
    } else if (end > start) {
      pushWidthSpan(profile, start, end, widthM);
    }
  }

  return profile.length > 0 ? profile : undefined;
}

export function syncTrackPolyline(track: TrackJson): TrackJson {
  if (!track.authoring?.nodes?.length) return track;
  const normalized = rotateAuthoringToStartFinish({
    ...track.authoring,
    segments: ensureTrackAuthoringSegments(track.authoring),
  });
  const points = compileTrackAuthoring(normalized, track.closed ?? true);
  const polylines = mirrorPolylineEdits(points);
  let merged = { ...track, authoring: normalized, ...polylines };
  merged = { ...merged, lap_length: recomputeLapLength(merged) };
  const widthProfile = buildWidthProfileFromAuthoring(merged);
  if (widthProfile) {
    merged = { ...merged, width_profile: widthProfile };
  }
  return merged;
}

export function inferTrackAuthoring(
  polyline: TrackPoint3[],
  closed: boolean,
  track?: TrackJson,
): TrackAuthoring {
  if (polyline.length < 2) {
    return { nodes: [], segments: [] };
  }

  const points = polyline.map((p) => ({ x: p.x, z: p.z }));
  const keep = new Set<number>([0, polyline.length - 1]);
  const epsilon = closed ? 18 : 12;
  douglasPeuckerIndices(points, 0, polyline.length - 1, epsilon, keep);

  let sorted = [...keep].sort((a, b) => a - b);
  if (closed && sorted.length >= 2) {
    const firstIdx = sorted[0];
    const lastIdx = sorted[sorted.length - 1];
    if (lastIdx !== firstIdx) {
      const a = polyline[firstIdx];
      const b = polyline[lastIdx];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.5) {
        sorted = sorted.slice(0, -1);
      }
    }
  }
  const nodes: PolylineAuthoringNode[] = [];

  for (let k = 0; k < sorted.length; k++) {
    const idx = sorted[k];
    const pt = polyline[idx];
    let type: PolylineAuthoringNode["type"] = "normal";
    if (k > 0 && k < sorted.length - 1) {
      const prev = polyline[sorted[k - 1]];
      const next = polyline[sorted[k + 1]];
      const angle = interiorAngleDeg(prev, pt, next);
      if (angle < 150) type = "turn_start";
    }
    const node: PolylineAuthoringNode = { x: pt.x, y: pt.y ?? 0, z: pt.z, type, start_finish: k === 0 };
    if (track?.width_profile?.length && track.lap_length && track.lap_length > 0) {
      const compiled = polyline;
      const { t } = projectPointOnCompiledPolyline(
        compiled,
        closed,
        track.lap_length,
        pt.x,
        pt.z,
      );
      const sampled = sampleWidthProfileAtT(
        track.width_profile,
        t,
        track.track_width_m ?? 12,
      );
      const defaultW = track.track_width_m ?? 12;
      if (Math.abs(sampled - defaultW) > 0.05) {
        node.width_m = sampled;
      }
    }
    nodes.push(node);
  }

  if (nodes.length > 0 && !nodes.some((n) => n.start_finish)) {
    nodes[0].start_finish = true;
  }

  inferCornerTurnPairs(nodes);
  inferTurnMidpoints(nodes);
  const segments = ensureTrackAuthoringSegments({ nodes, segments: [] });
  return { nodes, segments };
}

export function inferTrackAuthoringFromTrack(track: TrackJson): TrackAuthoring {
  let polyline = canonicalPolyline(track);
  if (track.lap_length != null && track.lap_length > 0) {
    polyline = decimateOversampledPolyline(
      polyline,
      track.lap_length,
      track.closed ?? true,
    );
  }
  return inferTrackAuthoring(polyline, track.closed ?? true, track);
}
