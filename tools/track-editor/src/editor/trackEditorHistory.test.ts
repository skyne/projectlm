import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrackJson } from "@server/game/track_json";
import { TrackEditorHistory } from "./trackEditorHistory";

const sample = (): TrackJson => ({
  name: "A",
  display_polyline: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
});

describe("TrackEditorHistory", () => {
  it("undo restores prior state and redo replays", () => {
    const h = new TrackEditorHistory();
    const v1 = sample();
    const v2 = { ...sample(), name: "B" };
    h.record(v1);
    let cur = v2;
    const undone = h.undo(cur);
    assert.equal(undone?.name, "A");
    cur = undone!;
    const redone = h.redo(cur);
    assert.equal(redone?.name, "B");
  });

  it("record clears redo stack", () => {
    const h = new TrackEditorHistory();
    const v1 = sample();
    const v2 = { ...sample(), name: "B" };
    h.record(v1);
    h.undo(v2);
    assert.ok(h.canRedo());
    h.record(v1);
    assert.ok(!h.canRedo());
  });

  it("skips drag record when unchanged", () => {
    const h = new TrackEditorHistory();
    const v = sample();
    h.recordDragIfChanged(v, structuredClone(v));
    assert.ok(!h.canUndo());
  });
});
