import type { PitLaneNodeType, TrackJson } from "@server/game/track_json";
import {
  deleteAuthoringNodes as deleteNodes,
  enableAuthoring,
  getAuthoringNodes,
  hasAuthoring,
  insertAuthoringNodeOnSegment as insertOnSegment,
  isStraightAuthoringSegment as isStraightSegment,
  moveAuthoringNodes as moveNodes,
  moveAuthoringSegmentParallel as moveSegmentParallel,
  setAuthoringNodeType as setNodeType,
  setPitSegmentSpeedLimit,
} from "./authoringState";

const SURFACE = "pit" as const;

export function hasPitAuthoring(track: TrackJson): boolean {
  return hasAuthoring(track, SURFACE);
}

export function getPitAuthoringNodes(track: TrackJson) {
  return getAuthoringNodes(track, SURFACE);
}

export function enablePitAuthoring(track: TrackJson): TrackJson {
  return enableAuthoring(track, SURFACE);
}

export function moveAuthoringNodes(
  track: TrackJson,
  indices: number[],
  x: number,
  z: number,
  anchorIndex: number,
  snapM = 0,
): TrackJson {
  return moveNodes(track, SURFACE, indices, x, z, anchorIndex, snapM);
}

export function setAuthoringNodeType(
  track: TrackJson,
  index: number,
  type: PitLaneNodeType,
): TrackJson {
  return setNodeType(track, SURFACE, index, type);
}

export function insertAuthoringNodeOnSegment(
  track: TrackJson,
  segmentIndex: number,
  x: number,
  z: number,
  snapM = 0,
  type: PitLaneNodeType = "normal",
): TrackJson {
  return insertOnSegment(track, SURFACE, segmentIndex, x, z, snapM, type);
}

export function deleteAuthoringNodes(track: TrackJson, indices: number[]): TrackJson {
  return deleteNodes(track, SURFACE, indices);
}

export function moveAuthoringSegmentParallel(
  track: TrackJson,
  segmentIndex: number,
  dx: number,
  dz: number,
  snapM = 0,
): TrackJson {
  return moveSegmentParallel(track, SURFACE, segmentIndex, dx, dz, snapM);
}

export function setAuthoringSegmentSpeedLimit(
  track: TrackJson,
  segmentIndex: number,
  speedLimitMs: number | undefined,
): TrackJson {
  return setPitSegmentSpeedLimit(track, segmentIndex, speedLimitMs);
}

export function isStraightAuthoringSegment(track: TrackJson, segmentIndex: number): boolean {
  return isStraightSegment(track, SURFACE, segmentIndex);
}
