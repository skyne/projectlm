import { compilePitLaneAuthoring } from "@server/game/pit_lane_authoring";
import { compileTrackAuthoring } from "@server/game/track_authoring";
import type { TrackJson } from "@server/game/track_json";
import type { EditorSurface } from "./trackEditorGeometry";

/** Dense centerline matching sim/viewer compile (curved turn spans). */
export function compileAuthoringCenterline(
  track: TrackJson,
  surface: EditorSurface,
): Array<{ x: number; z: number }> {
  if (surface === "pit") {
    const authoring = track.pit_lane?.authoring;
    if (!authoring?.nodes || authoring.nodes.length < 2) return [];
    return compilePitLaneAuthoring(authoring).map((p) => ({
      x: p.x,
      z: p.z,
    }));
  }
  const authoring = track.authoring;
  if (!authoring?.nodes || authoring.nodes.length < 2) return [];
  return compileTrackAuthoring(authoring, track.closed ?? true).map((p) => ({
    x: p.x,
    z: p.z,
  }));
}
