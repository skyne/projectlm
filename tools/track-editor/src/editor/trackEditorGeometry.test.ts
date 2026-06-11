import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrackJson } from "@server/game/track_json";
import {
  applyPolyline,
  deletePolylineVertex,
  getEditablePolyline,
  insertVertexOnSegment,
  movePolylineVertex,
} from "./trackEditorGeometry";

const baseTrack = (): TrackJson => ({
  name: "Square",
  closed: true,
  display_polyline: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 0, z: 100 },
    { x: 0, y: 0, z: 100 },
  ],
});

describe("trackEditorGeometry", () => {
  it("mirrors control_points when moving a vertex", () => {
    const moved = movePolylineVertex(baseTrack(), 1, 120, 0);
    assert.equal(moved.control_points?.[1].x, 120);
    assert.equal(moved.display_polyline?.[1].x, 120);
    assert.ok((moved.lap_length ?? 0) > 0);
  });

  it("inserts and deletes vertices", () => {
    let track = insertVertexOnSegment(baseTrack(), 0, 50, 0);
    assert.equal(getEditablePolyline(track).length, 5);
    track = deletePolylineVertex(track, 2);
    assert.equal(getEditablePolyline(track).length, 4);
  });

  it("won't delete below minimum for closed circuit", () => {
    let track = baseTrack();
    track = deletePolylineVertex(track, 0);
    track = deletePolylineVertex(track, 0);
    assert.equal(getEditablePolyline(track).length, 3);
    track = deletePolylineVertex(track, 0);
    assert.equal(getEditablePolyline(track).length, 3);
  });

  it("recomputes lap length on apply", () => {
    const track = applyPolyline(baseTrack(), getEditablePolyline(baseTrack()));
    assert.ok(Math.abs((track.lap_length ?? 0) - 400) < 1);
  });
});
