import {
  compilePolylineFromAuthoring,
  douglasPeuckerIndices,
  inferCornerTurnPairs,
  inferTurnMidpoints,
  interiorAngleDeg,
} from "./polyline_authoring";
import { syncTrackPolyline } from "./track_authoring";
import {
  canonicalPolyline,
  type PitLaneAuthoring,
  type PitLaneAuthoringSegment,
  type PitLanePointJson,
  type PitLanePointRole,
  type PolylineAuthoringNode,
  type TrackJson,
  type TrackPitLaneJson,
} from "./track_json";

function roleForAuthoringNode(node: PolylineAuthoringNode): PitLanePointRole {
  if (node.type === "box") return "box";
  if (node.type === "join") {
    return node.join_role === "exit" ? "exit" : "entry";
  }
  return "waypoint";
}

function appendCompiledPoint(
  out: PitLanePointJson[],
  pt: { x: number; y: number; z: number },
  role: PitLanePointRole,
): void {
  const last = out[out.length - 1];
  if (last && Math.hypot(last.x - pt.x, last.z - pt.z) < 0.5) return;
  out.push({ x: pt.x, y: pt.y, z: pt.z, role });
}

export function pitLaneArcLengthM(
  polyline: PitLanePointJson[],
  endIndex = polyline.length - 1,
): number {
  let accum = 0;
  const last = Math.min(endIndex, polyline.length - 1);
  for (let k = 1; k <= last; k++) {
    accum += Math.hypot(
      polyline[k].x - polyline[k - 1].x,
      polyline[k].z - polyline[k - 1].z,
    );
  }
  return accum;
}

/** Arc length from pit entry along the lane polyline to the pit-box stop point. */
export function pitBoxDistanceFromPolyline(
  polyline: PitLanePointJson[],
): number | undefined {
  const boxIdx = polyline.findIndex((p) => p.role === "box");
  if (boxIdx < 0) return undefined;
  return pitLaneArcLengthM(polyline, boxIdx);
}

export function joinTrackTFromNodes(
  nodes: PolylineAuthoringNode[],
  role: "entry" | "exit",
): number | undefined {
  for (const node of nodes) {
    if (node.type === "join" && node.join_role === role && node.track_t != null) {
      return node.track_t;
    }
  }
  if (role === "entry" && nodes[0]?.type === "join" && nodes[0].track_t != null) {
    return nodes[0].track_t;
  }
  const last = nodes[nodes.length - 1];
  if (role === "exit" && last?.type === "join" && last.track_t != null) {
    return last.track_t;
  }
  return undefined;
}

export function derivePitLaneScalars(
  track: TrackJson,
  polyline: PitLanePointJson[],
  nodes?: PolylineAuthoringNode[],
): Pick<TrackPitLaneJson, "box_distance_m" | "entry_t" | "exit_t"> {
  const derived: Pick<TrackPitLaneJson, "box_distance_m" | "entry_t" | "exit_t"> = {};
  const boxDistance = pitBoxDistanceFromPolyline(polyline);
  if (boxDistance != null) derived.box_distance_m = boxDistance;

  if (nodes?.length) {
    const entryT = joinTrackTFromNodes(nodes, "entry");
    const exitT = joinTrackTFromNodes(nodes, "exit");
    if (entryT != null) derived.entry_t = entryT;
    if (exitT != null) derived.exit_t = exitT;
    return derived;
  }

  const entryPt = polyline.find((p) => p.role === "entry") ?? polyline[0];
  const exitPt = polyline.find((p) => p.role === "exit") ?? polyline[polyline.length - 1];
  if (entryPt) {
    derived.entry_t = projectPointOnTrack(track, entryPt.x, entryPt.z).t;
  }
  if (exitPt) {
    derived.exit_t = projectPointOnTrack(track, exitPt.x, exitPt.z).t;
  }
  return derived;
}

export function compilePitLaneAuthoring(authoring: PitLaneAuthoring): PitLanePointJson[] {
  const nodes = authoring.nodes;
  if (nodes.length < 2) return [];

  const compiled = compilePolylineFromAuthoring(nodes, false);
  const out: PitLanePointJson[] = [];
  for (let i = 0; i < compiled.length; i++) {
    const pt = compiled[i];
    let role: PitLanePointRole = "waypoint";
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n];
      if (Math.hypot(node.x - pt.x, node.z - pt.z) < 2) {
        role = roleForAuthoringNode(node);
        break;
      }
    }
    if (i === 0) role = roleForAuthoringNode(nodes[0]);
    if (i === compiled.length - 1) role = roleForAuthoringNode(nodes[nodes.length - 1]);
    appendCompiledPoint(out, pt, role);
  }

  return out;
}

export function ensureAuthoringSegments(
  authoring: PitLaneAuthoring,
  defaultSpeedMs?: number,
): PitLaneAuthoringSegment[] {
  const count = Math.max(0, authoring.nodes.length - 1);
  const existing = authoring.segments ?? [];
  const segments: PitLaneAuthoringSegment[] = [];
  for (let i = 0; i < count; i++) {
    segments.push(
      existing[i] ?? {
        speed_limit_ms: defaultSpeedMs,
        zone: defaultSpeedMs != null ? "speed_limit" : "none",
      },
    );
  }
  return segments;
}

export function syncPitLanePolyline(track: TrackJson): TrackJson {
  const pit = track.pit_lane;
  if (!pit) return track;

  if (pit.authoring?.nodes?.length) {
    const segments = ensureAuthoringSegments(pit.authoring, pit.speed_limit_ms);
    const nodes = pit.authoring.nodes.map((node) => snapJoinNodeToTrack(track, node));
    const authoring = { ...pit.authoring, nodes, segments };
    const polyline = compilePitLaneAuthoring(authoring);
    const derived = derivePitLaneScalars(track, polyline, nodes);
    return {
      ...track,
      pit_lane: {
        ...pit,
        authoring,
        polyline,
        ...derived,
      },
    };
  }

  if (pit.polyline?.length) {
    const derived = derivePitLaneScalars(track, pit.polyline);
    return {
      ...track,
      pit_lane: {
        ...pit,
        ...derived,
      },
    };
  }

  return track;
}

function polylinePointToAuthoringType(
  role: PitLanePointRole,
  isFirst: boolean,
  isLast: boolean,
): Pick<PolylineAuthoringNode, "type" | "join_role"> {
  if (role === "entry" || (isFirst && role !== "exit")) {
    return { type: "join", join_role: "entry" };
  }
  if (role === "exit" || isLast) {
    return { type: "join", join_role: "exit" };
  }
  if (role === "box") {
    return { type: "box" };
  }
  return { type: "normal" };
}

export function inferPitLaneAuthoring(
  polyline: PitLanePointJson[],
  pit?: TrackPitLaneJson,
): PitLaneAuthoring {
  if (polyline.length < 2) {
    return { nodes: [], segments: [] };
  }

  const points = polyline.map((p) => ({ x: p.x, z: p.z }));
  const keep = new Set<number>([0, polyline.length - 1]);
  for (let i = 0; i < polyline.length; i++) {
    if (polyline[i].role === "entry" || polyline[i].role === "box" || polyline[i].role === "exit") {
      keep.add(i);
    }
  }
  douglasPeuckerIndices(points, 0, polyline.length - 1, 12, keep);

  const sorted = [...keep].sort((a, b) => a - b);
  const nodes: PolylineAuthoringNode[] = [];

  for (let k = 0; k < sorted.length; k++) {
    const idx = sorted[k];
    const pt = polyline[idx];
    const template = polylinePointToAuthoringType(
      pt.role,
      idx === 0,
      idx === polyline.length - 1,
    );
    let type = template.type;
    if (type === "normal" && k > 0 && k < sorted.length - 1) {
      const prev = polyline[sorted[k - 1]];
      const next = polyline[sorted[k + 1]];
      const angle = interiorAngleDeg(prev, pt, next);
      if (angle < 150) type = "turn_start";
    }
    nodes.push({
      x: pt.x,
      y: pt.y ?? 0,
      z: pt.z,
      type,
      ...(template.join_role ? { join_role: template.join_role } : {}),
    });
  }

  inferCornerTurnPairs(nodes);
  inferTurnMidpoints(nodes);
  const segments = ensureAuthoringSegments({ nodes, segments: [] }, pit?.speed_limit_ms);
  return { nodes, segments };
}

export function projectPointOnTrack(
  track: TrackJson,
  x: number,
  z: number,
): { x: number; z: number; t: number; distanceM: number } {
  const points = canonicalPolyline(track);
  const closed = track.closed ?? true;
  const lapLength = track.lap_length ?? 0;
  if (points.length < 2) {
    return { x, z, t: 0, distanceM: Infinity };
  }

  const limit = closed ? points.length : points.length - 1;
  let bestDist = Infinity;
  let bestX = x;
  let bestZ = z;
  let bestSeg = 0;
  let bestU = 0;

  for (let i = 0; i < limit; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
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
      bestX = cx;
      bestZ = cz;
      bestSeg = i;
      bestU = clamped;
    }
  }

  let chord = 0;
  for (let i = 0; i < bestSeg; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    chord += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const a = points[bestSeg];
  const b = points[(bestSeg + 1) % points.length];
  chord += Math.hypot(b.x - a.x, b.z - a.z) * bestU;
  let totalChord = 0;
  for (let i = 0; i < limit; i++) {
    const pa = points[i];
    const pb = points[(i + 1) % points.length];
    totalChord += Math.hypot(pb.x - pa.x, pb.z - pa.z);
  }
  const t = lapLength > 0 && totalChord > 0 ? (chord / totalChord) % 1 : 0;

  return { x: bestX, z: bestZ, t, distanceM: bestDist };
}

export function snapJoinNodeToTrack(
  track: TrackJson,
  node: PolylineAuthoringNode,
): PolylineAuthoringNode {
  if (node.type !== "join") return node;
  const hit = projectPointOnTrack(track, node.x, node.z);
  return {
    ...node,
    x: hit.x,
    z: hit.z,
    track_t: hit.t,
  };
}

export function syncAuthoringTrack(track: TrackJson): TrackJson {
  return syncPitLanePolyline(syncTrackPolyline(track));
}
