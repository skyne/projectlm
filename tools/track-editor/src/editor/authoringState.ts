import { syncPitLanePolyline } from "@server/game/pit_lane_authoring";
import {
  inferTrackAuthoringFromTrack,
  rotateAuthoringToStartFinish,
  syncTrackPolyline,
} from "@server/game/track_authoring";
import {
  inferPitLaneAuthoring,
  snapJoinNodeToTrack,
} from "@server/game/pit_lane_authoring";
import type {
  PitLaneAuthoring,
  PolylineAuthoringNode,
  PolylineNodeType,
  TrackAuthoring,
  TrackAuthoringSegment,
  TrackJson,
} from "@server/game/track_json";
import type { EditorSurface } from "./trackEditorGeometry";

export function finalizeAuthoringTrack(track: TrackJson): TrackJson {
  return syncPitLanePolyline(syncTrackPolyline(track));
}

export function hasAuthoring(track: TrackJson, surface: EditorSurface): boolean {
  if (surface === "pit") {
    return (track.pit_lane?.authoring?.nodes?.length ?? 0) >= 2;
  }
  return (track.authoring?.nodes?.length ?? 0) >= 2;
}

export function getAuthoringNodes(
  track: TrackJson,
  surface: EditorSurface,
): PolylineAuthoringNode[] {
  if (surface === "pit") return track.pit_lane?.authoring?.nodes ?? [];
  return track.authoring?.nodes ?? [];
}

export function isAuthoringClosed(_track: TrackJson, surface: EditorSurface): boolean {
  return surface === "layout";
}

export function enableAuthoring(track: TrackJson, surface: EditorSurface): TrackJson {
  if (surface === "pit") {
    const polyline = track.pit_lane?.polyline ?? [];
    if (polyline.length < 2) return track;
    const authoring = inferPitLaneAuthoring(polyline, track.pit_lane);
    return syncPitLanePolyline({
      ...track,
      pit_lane: { ...track.pit_lane, authoring },
    });
  }
  const authoring = inferTrackAuthoringFromTrack(track);
  return syncTrackPolyline({ ...track, authoring });
}

function applyLayoutAuthoring(track: TrackJson, authoring: TrackAuthoring): TrackJson {
  return syncTrackPolyline({ ...track, authoring });
}

function applyPitAuthoring(track: TrackJson, authoring: PitLaneAuthoring): TrackJson {
  return syncPitLanePolyline({
    ...track,
    pit_lane: { ...track.pit_lane, authoring },
  });
}

function applyAuthoringNodePositions(
  track: TrackJson,
  surface: EditorSurface,
  nodes: PolylineAuthoringNode[],
): TrackJson {
  if (surface === "pit") {
    return applyPitAuthoring(track, { ...track.pit_lane!.authoring!, nodes });
  }
  return applyLayoutAuthoring(track, { ...track.authoring!, nodes });
}

export function moveAuthoringNodes(
  track: TrackJson,
  surface: EditorSurface,
  indices: number[],
  x: number,
  z: number,
  anchorIndex: number,
  snapM = 0,
  /** Fixed drag origin — pass pointer-down snapshot for stable cursor tracking. */
  baseTrack?: TrackJson,
): TrackJson {
  const source = baseTrack ?? track;
  const nodes = getAuthoringNodes(source, surface).map((n) => ({ ...n }));
  const anchor = nodes[anchorIndex];
  if (!anchor) return track;
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  const dx = snap(x) - anchor.x;
  const dz = snap(z) - anchor.z;
  return nudgeAuthoringNodes(source, surface, indices, dx, dz, snapM, nodes);
}

export function nudgeAuthoringNodes(
  track: TrackJson,
  surface: EditorSurface,
  indices: number[],
  dx: number,
  dz: number,
  snapM = 0,
  /** Optional pre-cloned node list (used by moveAuthoringNodes). */
  nodesIn?: PolylineAuthoringNode[],
): TrackJson {
  const nodes = (nodesIn ?? getAuthoringNodes(track, surface)).map((n) => ({ ...n }));
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  for (const idx of indices) {
    if (idx < 0 || idx >= nodes.length) continue;
    nodes[idx] = {
      ...nodes[idx],
      x: snap(nodes[idx].x + dx),
      z: snap(nodes[idx].z + dz),
    };
    if (surface === "pit" && nodes[idx].type === "join") {
      nodes[idx] = snapJoinNodeToTrack(track, nodes[idx]);
    }
  }
  return applyAuthoringNodePositions(track, surface, nodes);
}

export function setAuthoringNodeType(
  track: TrackJson,
  surface: EditorSurface,
  index: number,
  type: PolylineNodeType,
): TrackJson {
  const nodes = getAuthoringNodes(track, surface).map((n) => ({ ...n }));
  if (index < 0 || index >= nodes.length) return track;
  const prev = nodes[index];
  nodes[index] = {
    ...prev,
    type,
    join_role:
      type === "join"
        ? prev.join_role ?? (index === 0 ? "entry" : "exit")
        : undefined,
  };
  if (surface === "pit" && type === "join") {
    nodes[index] = snapJoinNodeToTrack(track, nodes[index]);
  }
  if (surface === "pit") {
    return applyPitAuthoring(track, { ...track.pit_lane!.authoring!, nodes });
  }
  return applyLayoutAuthoring(track, { ...track.authoring!, nodes });
}

export function insertAuthoringNodeOnSegment(
  track: TrackJson,
  surface: EditorSurface,
  segmentIndex: number,
  x: number,
  z: number,
  snapM = 0,
  type: PolylineNodeType = "normal",
): TrackJson {
  const nodes = [...getAuthoringNodes(track, surface)];
  if (segmentIndex < 0 || segmentIndex >= nodes.length - 1) return track;
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  nodes.splice(segmentIndex + 1, 0, { x: snap(x), y: 0, z: snap(z), type });

  if (surface === "pit") {
    const segments = [...(track.pit_lane?.authoring?.segments ?? [])];
    const inherited = segments[segmentIndex];
    segments.splice(segmentIndex, 1, inherited ?? {}, inherited ?? {});
    return applyPitAuthoring(track, { ...track.pit_lane!.authoring!, nodes, segments });
  }

  const segments = [...(track.authoring?.segments ?? [])];
  const inherited = segments[segmentIndex];
  segments.splice(segmentIndex, 1, inherited ?? {}, inherited ?? {});
  return applyLayoutAuthoring(track, { ...track.authoring!, nodes, segments });
}

export function deleteAuthoringNodes(
  track: TrackJson,
  surface: EditorSurface,
  indices: number[],
): TrackJson {
  const toDelete = new Set(indices);
  if (toDelete.size === 0) return track;
  const src = getAuthoringNodes(track, surface);
  const nodes: PolylineAuthoringNode[] = [];
  for (let i = 0; i < src.length; i++) {
    if (!toDelete.has(i)) nodes.push(src[i]);
  }
  if (nodes.length < 2) return track;

  if (surface === "pit") {
    const segments = [...(track.pit_lane?.authoring?.segments ?? [])].filter(
      (_, i) => !toDelete.has(i) && !toDelete.has(i + 1),
    );
    return applyPitAuthoring(track, { ...track.pit_lane!.authoring!, nodes, segments });
  }

  const segments = [...(track.authoring?.segments ?? [])].filter(
    (_, i) => !toDelete.has(i) && !toDelete.has(i + 1),
  );
  return applyLayoutAuthoring(track, { ...track.authoring!, nodes, segments });
}

export function moveAuthoringSegmentParallel(
  track: TrackJson,
  surface: EditorSurface,
  segmentIndex: number,
  dx: number,
  dz: number,
  snapM = 0,
): TrackJson {
  const nodes = getAuthoringNodes(track, surface).map((n) => ({ ...n }));
  if (segmentIndex < 0 || segmentIndex >= nodes.length - 1) return track;
  const snap = snapM > 0 ? (v: number) => Math.round(v / snapM) * snapM : (v: number) => v;
  const a = nodes[segmentIndex];
  const b = nodes[segmentIndex + 1];
  if (surface === "pit" && (a.type === "join" || b.type === "join")) return track;
  nodes[segmentIndex] = { ...a, x: snap(a.x + dx), z: snap(a.z + dz) };
  nodes[segmentIndex + 1] = { ...b, x: snap(b.x + dx), z: snap(b.z + dz) };
  if (surface === "pit") {
    return applyPitAuthoring(track, { ...track.pit_lane!.authoring!, nodes });
  }
  return applyLayoutAuthoring(track, { ...track.authoring!, nodes });
}

export function setPitSegmentSpeedLimit(
  track: TrackJson,
  segmentIndex: number,
  speedLimitMs: number | undefined,
): TrackJson {
  const authoring = track.pit_lane?.authoring;
  if (!authoring || segmentIndex < 0 || segmentIndex >= authoring.nodes.length - 1) {
    return track;
  }
  const segments = [...(authoring.segments ?? [])];
  while (segments.length < authoring.nodes.length - 1) segments.push({});
  segments[segmentIndex] = {
    ...segments[segmentIndex],
    speed_limit_ms: speedLimitMs,
    zone: speedLimitMs != null ? "speed_limit" : "none",
  };
  return applyPitAuthoring(track, { ...authoring, segments });
}

export function setAuthoringNodeWidth(
  track: TrackJson,
  surface: EditorSurface,
  index: number,
  width_m: number | undefined,
): TrackJson {
  if (surface !== "layout") return track;
  const authoring = track.authoring;
  if (!authoring || index < 0 || index >= authoring.nodes.length) return track;
  const width =
    width_m != null && width_m > 0 ? width_m : undefined;
  const nodes = authoring.nodes.map((n) => ({ ...n }));
  nodes[index] = { ...nodes[index], width_m: width };

  if (width != null) {
    let left = index;
    while (left > 0 && isStraightAuthoringSegment(track, "layout", left - 1)) {
      nodes[left - 1] = { ...nodes[left - 1], width_m: width };
      left--;
    }
    let right = index;
    while (
      right < nodes.length - 1 &&
      isStraightAuthoringSegment(track, "layout", right)
    ) {
      nodes[right + 1] = { ...nodes[right + 1], width_m: width };
      right++;
    }
  }

  return applyLayoutAuthoring(track, { ...authoring, nodes });
}

export function setLayoutSegmentAttrs(
  track: TrackJson,
  segmentIndex: number,
  patch: Partial<TrackAuthoringSegment>,
): TrackJson {
  const authoring = track.authoring;
  if (!authoring || segmentIndex < 0 || segmentIndex >= authoring.nodes.length - 1) {
    return track;
  }
  const segments = [...(authoring.segments ?? [])];
  while (segments.length < authoring.nodes.length - 1) segments.push({});
  segments[segmentIndex] = { ...segments[segmentIndex], ...patch };
  return applyLayoutAuthoring(track, { ...authoring, segments });
}

export function setLayoutStartFinishNode(track: TrackJson, index: number): TrackJson {
  const authoring = track.authoring;
  if (!authoring || index < 0 || index >= authoring.nodes.length) return track;
  const nodes = authoring.nodes.map((n, i) => ({
    ...n,
    start_finish: i === index,
  }));
  const rotated = rotateAuthoringToStartFinish({
    ...authoring,
    nodes,
    segments: authoring.segments ?? [],
  });
  return syncTrackPolyline({ ...track, authoring: rotated });
}

export function isStraightAuthoringSegment(
  track: TrackJson,
  surface: EditorSurface,
  segmentIndex: number,
): boolean {
  const nodes = getAuthoringNodes(track, surface);
  if (segmentIndex < 0 || segmentIndex >= nodes.length - 1) return false;
  const a = nodes[segmentIndex];
  const b = nodes[segmentIndex + 1];
  const straightTypes: PolylineNodeType[] =
    surface === "pit" ? ["normal", "box", "join"] : ["normal"];
  return (
    straightTypes.includes(a.type) &&
    straightTypes.includes(b.type) &&
    a.type !== "turn_start" &&
    a.type !== "turn_mid" &&
    b.type !== "turn_mid" &&
    b.type !== "turn_end"
  );
}
