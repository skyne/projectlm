import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compilePitLaneAuthoring,
  derivePitLaneScalars,
  inferPitLaneAuthoring,
  pitBoxDistanceFromPolyline,
  syncAuthoringTrack,
  syncPitLanePolyline,
} from "../../../server/src/game/pit_lane_authoring.ts";
import { enableAuthoring } from "./editor/authoringState.ts";

describe("pit_lane_authoring", () => {
  it("compiles straight spans between normal nodes", () => {
    const polyline = compilePitLaneAuthoring({
      nodes: [
        { x: 0, y: 0, z: 0, type: "join", join_role: "entry" },
        { x: 100, y: 0, z: 0, type: "normal" },
        { x: 100, y: 0, z: 50, type: "join", join_role: "exit" },
      ],
      segments: [],
    });
    assert.ok(polyline.length >= 3);
    assert.equal(polyline[0].role, "entry");
    assert.equal(polyline[polyline.length - 1].role, "exit");
  });

  it("compiles turn spans as smooth curves", () => {
    const polyline = compilePitLaneAuthoring({
      nodes: [
        { x: 0, y: 0, z: 0, type: "join", join_role: "entry" },
        { x: 0, y: 0, z: 30, type: "turn_start" },
        { x: 30, y: 0, z: 60, type: "turn_end" },
        { x: 60, y: 0, z: 60, type: "join", join_role: "exit" },
      ],
      segments: [],
    });
    assert.ok(polyline.length >= 4);
    const maxX = Math.max(...polyline.map((p) => p.x));
    assert.ok(maxX > 10);
  });

  it("infers sparse nodes from dense polyline", () => {
    const dense = [
      { x: 0, y: 0, z: 0, role: "entry" as const },
      { x: 10, y: 0, z: 0, role: "waypoint" as const },
      { x: 20, y: 0, z: 0, role: "waypoint" as const },
      { x: 30, y: 0, z: 0, role: "waypoint" as const },
      { x: 30, y: 0, z: 30, role: "exit" as const },
    ];
    const authoring = inferPitLaneAuthoring(dense);
    assert.ok(authoring.nodes.length <= 4);
    assert.equal(authoring.nodes[0].type, "join");
    assert.equal(authoring.nodes[authoring.nodes.length - 1].join_role, "exit");
  });

  it("derives box_distance_m from box node along compiled polyline", () => {
    const authoring = {
      nodes: [
        { x: 0, y: 0, z: 0, type: "join" as const, join_role: "entry" as const, track_t: 0.98 },
        { x: 100, y: 0, z: 0, type: "box" as const },
        { x: 200, y: 0, z: 0, type: "join" as const, join_role: "exit" as const, track_t: 0.05 },
      ],
      segments: [],
    };
    const polyline = compilePitLaneAuthoring(authoring);
    const boxDistance = pitBoxDistanceFromPolyline(polyline);
    assert.ok(boxDistance != null && Math.abs(boxDistance - 100) < 2);
    const synced = syncPitLanePolyline({
      name: "test",
      closed: true,
      lap_length: 1000,
      control_points: [
        { x: 0, y: 0, z: 0 },
        { x: 1000, y: 0, z: 0 },
      ],
      pit_lane: { authoring, speed_limit_ms: 16.67 },
    });
    assert.ok(Math.abs((synced.pit_lane?.box_distance_m ?? 0) - 100) < 2);
    assert.ok((synced.pit_lane?.entry_t ?? -1) >= 0);
    assert.ok((synced.pit_lane?.exit_t ?? -1) >= 0);
    assert.equal(synced.pit_lane?.authoring?.nodes[0].track_t, synced.pit_lane?.entry_t);
  });

  it("derivePitLaneScalars reads join track_t from authoring nodes", () => {
    const polyline = [
      { x: 0, y: 0, z: 0, role: "entry" as const },
      { x: 50, y: 0, z: 0, role: "box" as const },
      { x: 100, y: 0, z: 0, role: "exit" as const },
    ];
    const nodes = [
      { x: 0, y: 0, z: 0, type: "join" as const, join_role: "entry" as const, track_t: 0.97 },
      { x: 50, y: 0, z: 0, type: "box" as const },
      { x: 100, y: 0, z: 0, type: "join" as const, join_role: "exit" as const, track_t: 0.04 },
    ];
    const derived = derivePitLaneScalars(
      { name: "t", closed: true, control_points: [{ x: 0, y: 0, z: 0 }] },
      polyline,
      nodes,
    );
    assert.equal(derived.entry_t, 0.97);
    assert.equal(derived.exit_t, 0.04);
    assert.ok(Math.abs((derived.box_distance_m ?? 0) - 50) < 0.01);
  });

  it("enablePitAuthoring writes compiled polyline", () => {
    const track = enableAuthoring(
      {
        name: "test",
        closed: true,
        lap_length: 1000,
        control_points: [
          { x: 0, y: 0, z: 0 },
          { x: 1000, y: 0, z: 0 },
        ],
        pit_lane: {
          polyline: [
            { x: 0, y: 0, z: 0, role: "entry" },
            { x: 50, y: 0, z: 0, role: "waypoint" },
            { x: 100, y: 0, z: 0, role: "exit" },
          ],
        },
      },
      "pit",
    );
    assert.ok(track.pit_lane?.authoring?.nodes.length);
    assert.ok((track.pit_lane?.polyline?.length ?? 0) >= 2);
    const resynced = syncAuthoringTrack(track);
    assert.equal(resynced.pit_lane?.polyline?.length, track.pit_lane?.polyline?.length);
  });
});
