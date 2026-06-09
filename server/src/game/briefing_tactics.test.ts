import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAiBriefing,
  resolveBriefingTactics,
  teammateOnTrackGapSec,
} from "./briefing_tactics";
import type { PlannerSnap } from "./pitbot/pit_planner";

describe("briefing_tactics", () => {
  it("maps pole_attack to soft push with minimal fuel", () => {
    const t = resolveBriefingTactics(
      { carId: "c1", briefingId: "pole_attack" },
      "qualifying",
      "Hypercar",
    );
    assert.equal(t.compound, "soft");
    assert.equal(t.driverMode, "push");
    assert.ok(t.pitFuelLiters != null && t.pitFuelLiters < 30);
  });

  it("maps conserve to harvest hybrid and higher fuel stop fraction", () => {
    const t = resolveBriefingTactics(
      { carId: "c1", briefingId: "conserve" },
      "race",
      "Hypercar",
    );
    assert.equal(t.driverMode, "conserve");
    assert.equal(t.hybridStrategy, "harvest");
    assert.ok(t.fuelStopFraction > 0.28);
  });

  it("derives pole_attack for aggressive lead AI in quali", () => {
    const b = deriveAiBriefing("qualifying", {
      gridIndex: 0,
      teamSize: 2,
      pitAggression: 1.2,
      classId: "Hypercar",
    });
    assert.equal(b.briefingId, "pole_attack");
  });

  it("detects teammate on track within yield threshold", () => {
    const snap = {
      entryId: "e1",
      teamName: "Us",
      classId: "Hypercar",
      gapToLeader: 10,
      retired: false,
      inGarage: false,
    } as PlannerSnap;
    const other = {
      entryId: "e2",
      teamName: "Us",
      classId: "Hypercar",
      gapToLeader: 10.2,
      retired: false,
      inGarage: false,
    } as PlannerSnap;
    assert.equal(teammateOnTrackGapSec(snap, [snap, other], 0.3), true);
    assert.equal(teammateOnTrackGapSec(snap, [snap, other], 0.1), false);
  });
});
