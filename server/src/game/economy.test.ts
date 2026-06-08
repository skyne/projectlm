import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDriverPayrollFromContracts,
  computeRaceFinances,
} from "./economy";

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

  it("deducts driver payroll from race finances", () => {
    const fin = computeRaceFinances(3, "Hypercar", "6h", [], [], {
      scoring: true,
      teamName: "Sky Racing",
      employmentContracts: [
        {
          entityId: "d1",
          entityKind: "driver",
          teamName: "Sky Racing",
          signedRound: 1,
          expiresSeasonYear: 2028,
          signingFeePaid: 100_000,
          salaryPerRace: 15_000,
        },
      ],
    });
    assert.equal(fin.driverPayroll, 15_000);
    assert.ok(fin.netEarnings < fin.prizeMoney + fin.appearanceFee);
  });

  it("computes driver payroll helper", () => {
    const payroll = computeDriverPayrollFromContracts(
      [
        {
          entityId: "d1",
          entityKind: "driver",
          teamName: "Team A",
          signedRound: 0,
          expiresSeasonYear: 2028,
          signingFeePaid: 0,
          salaryPerRace: 9_000,
        },
      ],
      "Team A",
    );
    assert.equal(payroll, 9_000);
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
