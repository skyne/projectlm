import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrackGeometryPayload } from "../ws/protocol";
import { trackGeometryEqual } from "./trackGeometry";

const base: TrackGeometryPayload = {
  name: "Test Circuit",
  lapLength: 5000,
  closed: true,
  polyline: [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
  ],
  sectors: [
    { name: "S1", startT: 0, endT: 0.33, labelX: 1, labelZ: 1 },
    { name: "S2", startT: 0.33, endT: 0.66, labelX: 5, labelZ: 1 },
    { name: "S3", startT: 0.66, endT: 1, labelX: 8, labelZ: 8 },
  ],
  mapLabels: [{ text: "T1", x: 2, z: 2, anchor: "middle" }],
};

describe("trackGeometryEqual", () => {
  it("matches identical payloads", () => {
    assert.equal(trackGeometryEqual(base, { ...base }), true);
  });

  it("detects polyline changes", () => {
    const other = {
      ...base,
      polyline: [...base.polyline, { x: 0, z: 10 }],
    };
    assert.equal(trackGeometryEqual(base, other), false);
  });

  it("detects sector changes", () => {
    const other = {
      ...base,
      sectors: base.sectors.map((s, i) =>
        i === 0 ? { ...s, endT: 0.34 } : s,
      ),
    };
    assert.equal(trackGeometryEqual(base, other), false);
  });

  it("detects width profile changes", () => {
    const other = {
      ...base,
      widthProfile: [{ startT: 0, endT: 0.5, widthM: 12 }],
    };
    assert.equal(trackGeometryEqual(base, other), false);
    assert.equal(
      trackGeometryEqual(other, {
        ...other,
        widthProfile: [{ startT: 0, endT: 0.5, widthM: 15 }],
      }),
      false,
    );
  });

  it("treats missing map labels the same as an empty list", () => {
    const { mapLabels: _a, ...noLabelsA } = base;
    const { mapLabels: _b, ...noLabelsB } = base;
    assert.equal(
      trackGeometryEqual(
        noLabelsA as TrackGeometryPayload,
        noLabelsB as TrackGeometryPayload,
      ),
      true,
    );
  });
});
