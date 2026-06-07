import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CarSnapshot } from "../ws/protocol";
import {
  dedupeSnapshotsByEntryId,
  orderLeaderboardBoard,
  uniqueEntryIds,
} from "./leaderboardBoard";

function row(
  entryId: string,
  classId: string,
  racePosition: number,
  classPosition?: number,
): CarSnapshot {
  return {
    entryId,
    teamName: entryId,
    carNumber: entryId,
    classId,
    lap: 1,
    distance: racePosition,
    normalizedT: 0,
    speed: 80,
    rpm: 6000,
    fuel: 50,
    tireWear: 0,
    engineHealth: 100,
    sectorIndex: 0,
    racePosition,
    classPosition,
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
  };
}

describe("leaderboardBoard", () => {
  it("orders overall race by racePosition", () => {
    const board = orderLeaderboardBoard(
      [row("e3", "LMGT3", 3), row("e1", "Hypercar", 1), row("e2", "LMP2", 2)],
      { timingMode: false, gapScope: "overall", playerEntryId: "e1" },
    );
    assert.deepEqual(board.map((s) => s.entryId), ["e1", "e2", "e3"]);
  });

  it("filters to player class when scope is class", () => {
    const board = orderLeaderboardBoard(
      [
        row("h1", "Hypercar", 1, 1),
        row("g1", "LMGT3", 2, 1),
        row("h2", "Hypercar", 3, 2),
      ],
      { timingMode: false, gapScope: "class", playerEntryId: "h2" },
    );
    assert.deepEqual(board.map((s) => s.entryId), ["h1", "h2"]);
  });

  it("class scope orders by racePosition not mixed class/overall keys", () => {
    const board = orderLeaderboardBoard(
      [
        row("g-leader", "LMGT3", 4, 1),
        row("g-back", "LMGT3", 12, 2),
      ],
      { timingMode: false, gapScope: "class", playerEntryId: "g-back" },
    );
    assert.deepEqual(board.map((s) => s.entryId), ["g-leader", "g-back"]);
  });

  it("resolves class from managed entries when selected car is missing", () => {
    const board = orderLeaderboardBoard(
      [row("h1", "Hypercar", 1, 1), row("g1", "LMGT3", 2, 1)],
      {
        timingMode: false,
        gapScope: "class",
        playerEntryId: "missing",
        managedEntryIds: ["g1"],
      },
    );
    assert.deepEqual(board.map((s) => s.entryId), ["g1"]);
  });

  it("dedupeSnapshotsByEntryId keeps last snapshot per entry", () => {
    const deduped = dedupeSnapshotsByEntryId([
      row("entry-1", "Hypercar", 1, 1),
      row("entry-1", "LMGT3", 8, 3),
      row("entry-2", "LMP2", 3),
    ]);
    assert.equal(deduped.length, 2);
    assert.equal(deduped.find((s) => s.entryId === "entry-1")?.racePosition, 8);
  });

  it("uniqueEntryIds flags duplicate map keys", () => {
    const snaps = [
      row("entry-1", "Hypercar", 1),
      row("entry-1", "LMGT3", 2),
      row("entry-2", "LMP2", 3),
    ];
    assert.equal(uniqueEntryIds(snaps).length, 2);
  });
});
