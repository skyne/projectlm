import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRaceFinances } from "./economy";

describe("experimental race finances", () => {
  it("pays appearance and media exposure but no points or prize money", () => {
    const fin = computeRaceFinances(1, "Hypercar", "6h", [], [], {
      scoring: true,
      entryMode: "experimental",
      racePosition: 8,
    });
    assert.equal(fin.prizeMoney, 0);
    assert.equal(fin.championshipPoints, 0);
    assert.ok(fin.appearanceFee > 0);
    assert.ok(fin.netEarnings > 0);
    assert.ok(fin.rdPointsEarned >= 0);
  });

  it("still awards championship points for homologated entries", () => {
    const fin = computeRaceFinances(1, "Hypercar", "6h", [], [], {
      scoring: true,
      entryMode: "homologated",
    });
    assert.ok(fin.championshipPoints > 0);
    assert.ok(fin.prizeMoney > 0);
  });
});
