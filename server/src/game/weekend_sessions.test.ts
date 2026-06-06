import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyQualifyingGrid,
  canStartWeekendSession,
  nextWeekendSession,
  appliesWeekendSchedule,
  sortTimingResults,
} from "./weekend_sessions";
import type { GeneratedEntry } from "./grid_generator";

function entry(
  entryId: string,
  classId: string,
  grid: number,
): GeneratedEntry {
  return {
    entryId,
    teamName: entryId,
    carConfigPath: "configs/car.txt",
    classId,
    grid,
    carNumber: String(grid),
    isPlayer: false,
  };
}

describe("weekend_sessions", () => {
  it("applies multi-session schedule only to race rounds", () => {
    assert.equal(appliesWeekendSchedule("test", "test"), false);
    assert.equal(appliesWeekendSchedule("race", "6h"), true);
  });

  it("advances practice → qualifying → race", () => {
    assert.equal(nextWeekendSession([]), "practice");
    assert.equal(nextWeekendSession(["practice"]), "qualifying");
    assert.equal(
      nextWeekendSession(["practice", "qualifying"]),
      "race",
    );
    assert.equal(
      nextWeekendSession(["practice", "qualifying", "race"]),
      null,
    );
  });

  it("enforces session order", () => {
    assert.equal(canStartWeekendSession("practice", []), null);
    assert.match(
      canStartWeekendSession("qualifying", []) ?? "",
      /free practice/i,
    );
    assert.match(
      canStartWeekendSession("race", ["practice"]) ?? "",
      /qualifying/i,
    );
    assert.equal(
      canStartWeekendSession("race", ["practice", "qualifying"]),
      null,
    );
  });

  it("nextWeekendSession after practice complete returns qualifying", () => {
    assert.equal(nextWeekendSession(["practice"]), "qualifying");
    assert.equal(
      nextWeekendSession(["practice", "qualifying"]),
      "race",
    );
  });

  it("sortTimingResults orders by best lap with no-lap entries last", () => {
    const sorted = sortTimingResults([
      { entryId: "slow", bestLapTime: 99.1 },
      { entryId: "fast", bestLapTime: 97.2 },
      { entryId: "none", bestLapTime: 0 },
      { entryId: "mid", bestLapTime: 98.0 },
    ]);
    assert.deepEqual(
      sorted.map((r) => r.entryId),
      ["fast", "mid", "slow", "none"],
    );
  });

  it("applyQualifyingGrid sorts by best lap per class", () => {
    const entries = [
      entry("e1", "Hypercar", 1),
      entry("e2", "Hypercar", 2),
      entry("e3", "GT3", 3),
      entry("e4", "GT3", 4),
    ];
    const reordered = applyQualifyingGrid(entries, [
      { entryId: "e1", classId: "Hypercar", bestLapTime: 98.2 },
      { entryId: "e2", classId: "Hypercar", bestLapTime: 97.5 },
      { entryId: "e3", classId: "GT3", bestLapTime: 102.1 },
      { entryId: "e4", classId: "GT3", bestLapTime: 101.4 },
    ]);
    const hyper = reordered.filter((e) => e.classId === "Hypercar");
    const gt3 = reordered.filter((e) => e.classId === "GT3");
    assert.equal(hyper[0].entryId, "e2");
    assert.equal(hyper[0].grid, 1);
    assert.equal(gt3[0].entryId, "e4");
    assert.equal(gt3[0].grid, 1);
  });
});
