import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CarSnapshot } from "../ws/protocol";
import {
  personalSectorBests,
  sessionBestLap,
  sessionSectorBests,
  timingCompareClass,
} from "./timingColors";

function snap(partial: Partial<CarSnapshot> & Pick<CarSnapshot, "entryId">): CarSnapshot {
  return {
    teamName: "Team",
    carNumber: "1",
    classId: "Hypercar",
    lap: 1,
    distance: 0,
    normalizedT: 0,
    speed: 0,
    rpm: 0,
    fuel: 0,
    tireWear: 0,
    engineHealth: 1,
    sectorIndex: 0,
    racePosition: 1,
    inPit: false,
    retired: false,
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    gapToLeader: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    ...partial,
  };
}

describe("timingColors", () => {
  it("picks session and personal sector bests", () => {
    const snapshots = [
      snap({
        entryId: "a",
        lapHistory: [{ lapNumber: 1, lapTime: 90, sectorTimes: [30, 30, 30] }],
        currentLapSectorTimes: [29],
      }),
      snap({
        entryId: "b",
        lapHistory: [{ lapNumber: 1, lapTime: 88, sectorTimes: [28, 30, 30] }],
      }),
    ];

    assert.deepEqual(sessionSectorBests(snapshots, 3), [28, 30, 30]);
    assert.deepEqual(personalSectorBests(snapshots[0], 3), [29, 30, 30]);
  });

  it("colors absolute ahead of personal", () => {
    assert.equal(timingCompareClass(28, 29, 28), "timing-absolute");
    assert.equal(timingCompareClass(29, 29, 28), "timing-personal");
    assert.equal(timingCompareClass(31, 29, 28), "");
  });

  it("finds session best lap", () => {
    const snapshots = [
      snap({ entryId: "a", bestLapTime: 91.2 }),
      snap({ entryId: "b", bestLapTime: 90.8 }),
    ];
    assert.equal(sessionBestLap(snapshots), 90.8);
  });
});
