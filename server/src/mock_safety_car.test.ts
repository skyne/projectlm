import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMockSafetyCarSnapshot,
  createParkedMockSafetyCar,
  deployMockSafetyCar,
  peelOffMockSafetyCar,
  tickMockSafetyCar,
} from "./mock_safety_car";

const LAP = 5000;
const samples = [
  {
    distance: 0,
    normalizedT: 0,
    x: 0,
    z: 0,
    tangentX: 1,
    tangentZ: 0,
  },
  {
    distance: LAP,
    normalizedT: 1,
    x: LAP,
    z: 0,
    tangentX: 1,
    tangentZ: 0,
  },
];

describe("mock_safety_car", () => {
  it("emits a map snapshot while deployed", () => {
    const sc = createParkedMockSafetyCar(LAP);
    assert.equal(buildMockSafetyCarSnapshot(sc, LAP, samples), null);

    deployMockSafetyCar(sc, LAP);
    tickMockSafetyCar(sc, LAP, 1000, 0.5);

    const snap = buildMockSafetyCarSnapshot(sc, LAP, samples);
    assert.equal(snap?.entryId, "safety-car");
    assert.equal(snap?.inPit, true);
    assert.equal(typeof snap?.position.x, "number");
  });

  it("returns to pit box after peel-off", () => {
    const sc = createParkedMockSafetyCar(LAP);
    deployMockSafetyCar(sc, LAP);
    for (let i = 0; i < 200; i++) tickMockSafetyCar(sc, LAP, 1200, 0.1);
    const phaseAfterDeploy = sc.phase;
    assert.equal(phaseAfterDeploy, "on_track");

    sc.distance = LAP - 30;
    peelOffMockSafetyCar(sc);
    let sawForwardPitEntry = false;
    let prevPitDist = -1;
    for (let i = 0; i < 500; i++) {
      tickMockSafetyCar(sc, LAP, 1200, 0.05);
      const phase = sc.phase;
      if (phase === "entering_pit" && sc.inPit) {
        if (prevPitDist >= 0 && sc.pitLaneDistance > prevPitDist) sawForwardPitEntry = true;
        prevPitDist = sc.pitLaneDistance;
      }
      if (phase === "parked") break;
    }
    assert.equal(sc.phase, "parked");
    assert.equal(sc.inPit, true);
    assert.ok(sawForwardPitEntry, "SC should drive forward through pit entrance");
    assert.equal(buildMockSafetyCarSnapshot(sc, LAP, samples), null);
  });
});
