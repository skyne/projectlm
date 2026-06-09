import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CarSnapshot } from "../ws/protocol";
import { orderSnapshotsForMap } from "./mapSnapshots";

function snap(entryId: string): CarSnapshot {
  return {
    entryId,
    teamName: entryId,
    carNumber: "1",
    classId: "Hypercar",
    lap: 1,
    distance: 0,
    normalizedT: 0,
    speed: 0,
    rpm: 0,
    fuel: 1,
    tireWear: 0,
    tireWearFL: 0,
    tireWearFR: 0,
    tireWearRL: 0,
    tireWearRR: 0,
    tireCompound: "medium",
    tireTempC: 0,
    coolantTempC: 0,
    engineHealth: 100,
    sectorIndex: 0,
    racePosition: 1,
    classPosition: 1,
    inGarage: false,
    inPit: false,
    pitQueued: false,
    driverName: "Driver",
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    gapToLeader: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
  };
}

describe("orderSnapshotsForMap", () => {
  it("places safety car last for map z-order", () => {
    const ordered = orderSnapshotsForMap([
      snap("safety-car"),
      snap("entry-1"),
      snap("entry-2"),
    ]);
    assert.deepEqual(
      ordered.map((s) => s.entryId),
      ["entry-1", "entry-2", "safety-car"],
    );
  });
});
