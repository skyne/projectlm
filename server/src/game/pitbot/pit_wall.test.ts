import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sortedTeamClasses,
  teamResultsByClass,
} from "./pit_wall";
import type { CarSnapshot } from "../../ws_protocol";

function snap(classId: string, entryId: string, teamName: string): CarSnapshot {
  return {
    entryId,
    teamName,
    carNumber: entryId,
    classId,
    lap: 1,
    distance: 0,
    normalizedT: 0,
    speed: 0,
    rpm: 0,
    fuel: 50,
    tireWear: 0,
    engineHealth: 100,
    sectorIndex: 0,
    racePosition: 1,
    inPit: false,
    retired: false,
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    gapToLeader: 0,
    currentLapSectorTimes: [0, 0, 0],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
  };
}

describe("teamResultsByClass", () => {
  it("groups managed entries by class", () => {
    const snaps = [
      snap("LMP2", "e1", "Cursor Racing"),
      snap("LMGT3", "e2", "Cursor Racing"),
      snap("Hypercar", "e3", "Other Team"),
    ];
    const byClass = teamResultsByClass(snaps, { entryIds: ["e1", "e2"] });
    assert.equal(byClass.LMP2?.length, 1);
    assert.equal(byClass.LMGT3?.length, 1);
    assert.equal(byClass.Hypercar, undefined);
  });
});

describe("sortedTeamClasses", () => {
  it("orders Hypercar before LMP2 before LMGT3", () => {
    const order = sortedTeamClasses({
      LMGT3: [snap("LMGT3", "g1", "T")],
      LMP2: [snap("LMP2", "p1", "T")],
      Hypercar: [snap("Hypercar", "h1", "T")],
    });
    assert.deepEqual(order, ["Hypercar", "LMP2", "LMGT3"]);
  });
});
