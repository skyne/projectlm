import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERIMETER_BARRIER_WIDTH_M,
  PERIMETER_GRASS_GAP_M,
  synthesizePerimeterSurfaces,
} from "./perimeter_surfaces";

describe("synthesizePerimeterSurfaces", () => {
  it("fills bare straights with 10m grass and a barrier on both sides", () => {
    const profile = synthesizePerimeterSurfaces({
      profile: [],
      defaultWidthM: 12,
    });
    assert.ok(profile.length >= 2);
    const grass = profile.filter((s) => s.variant === "grass");
    const barriers = profile.filter((s) => s.surface.startsWith("barrier"));
    assert.ok(grass.length >= 2);
    assert.ok(barriers.length >= 2);
    const outGrass = grass.find((s) => s.side === "outboard");
    assert.ok(outGrass);
    assert.equal(outGrass!.widthM, PERIMETER_GRASS_GAP_M - 2);
    assert.equal(outGrass!.innerOffsetM, 0);
    const outBarrier = barriers.find((s) => s.side === "outboard");
    assert.ok(outBarrier);
    assert.equal(outBarrier!.innerOffsetM, PERIMETER_GRASS_GAP_M - 2);
    assert.equal(outBarrier!.widthM, PERIMETER_BARRIER_WIDTH_M);
  });

  it("places synthesized barrier at runoff outer edge when runoff exists", () => {
    const profile = synthesizePerimeterSurfaces({
      profile: [
        {
          startT: 0.4,
          endT: 0.5,
          side: "outboard",
          surface: "runoff_concrete",
          widthM: 12,
          innerOffsetM: 0,
        },
      ],
      defaultWidthM: 12,
    });
    const synthBarrier = profile.find(
      (s) =>
        s.name?.includes("barrier") &&
        s.side === "outboard" &&
        s.startT <= 0.45 &&
        s.endT >= 0.45,
    );
    assert.ok(synthBarrier);
    // Runoff band starts after default verge (2m) on a 12m-wide track.
    assert.equal(synthBarrier!.innerOffsetM, 12);
    const synthGrass = profile.find(
      (s) =>
        s.variant === "grass" &&
        s.side === "outboard" &&
        s.startT <= 0.45 &&
        s.endT >= 0.45,
    );
    assert.equal(synthGrass, undefined);
  });

  it("keeps explicit barrier segments and skips duplicate synth barrier", () => {
    const profile = synthesizePerimeterSurfaces({
      profile: [
        {
          name: "T1 outer barrier",
          startT: 0.05,
          endT: 0.1,
          side: "outboard",
          surface: "barrier_tecpro",
          widthM: 1.2,
          innerOffsetM: 20,
        },
      ],
      defaultWidthM: 12,
    });
    const explicit = profile.filter((s) => s.name === "T1 outer barrier");
    assert.equal(explicit.length, 1);
    const synthAtCorner = profile.filter(
      (s) =>
        s.name?.startsWith("synth:perimeter-barrier") &&
        s.side === "outboard" &&
        s.startT < 0.1 &&
        s.endT > 0.05,
    );
    assert.equal(synthAtCorner.length, 0);
  });
});
