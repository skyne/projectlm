import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateDefaultPitLaneFields, pitLaneSpanM } from "../../../server/src/game/pit_lane_baseline.ts";
import type { TrackJson } from "../../../server/src/game/track_json.ts";

describe("pit_lane_baseline", () => {
  it("samples from entry_t toward exit_t, not lap start", () => {
    const track: TrackJson = {
      name: "Mini",
      closed: true,
      lap_length: 1000,
      display_polyline: [
        { x: 0, y: 0, z: 0 },
        { x: 500, y: 0, z: 0 },
        { x: 500, y: 0, z: 500 },
        { x: 0, y: 0, z: 500 },
      ],
      pit_lane: { entry_t: 0.985, exit_t: 0.06, offset_m: 10 },
    };
    const span = pitLaneSpanM(1000, 0.985, 0.06, true);
    assert.ok(Math.abs(span - 75) < 1);

    const pit = generateDefaultPitLaneFields(track);
    assert.ok(pit.polyline && pit.polyline.length >= 2);
    assert.equal(pit.polyline[0].role, "entry");
    assert.equal(pit.polyline[pit.polyline.length - 1].role, "exit");

    const entry = pit.polyline[0];
    const lapStart = track.display_polyline![0];
    const entryDist = Math.hypot(entry.x - lapStart.x, entry.z - lapStart.z);
    assert.ok(entryDist > 5, "entry should not sit on lap t=0");
  });
});
