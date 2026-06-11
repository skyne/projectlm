import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySponsorAppeal,
  computeCarSponsorAppeal,
} from "./sponsor_appeal";
import type { DriverProfilePayload, StaffMemberPayload } from "../ws_protocol";

function driver(id: string, gender?: "female" | "male"): DriverProfilePayload {
  return {
    id,
    name: id,
    nationality: "GB",
    tier: "Gold",
    gender,
    dryPace: 80,
    wetPace: 78,
    consistency: 80,
    overtaking: 75,
    defending: 75,
    trafficManagement: 75,
    rollingStart: 74,
    standingStart: 74,
    setupFeedback: 72,
    tireManagement: 76,
    fuelSaving: 74,
    composure: 78,
    nightPace: 76,
    rainRadar: 70,
    stamina: 80,
    maxStintHours: 3,
  };
}

describe("computeCarSponsorAppeal", () => {
  it("returns 1.0 multiplier with no gender data", () => {
    const r = computeCarSponsorAppeal(["a", "b"], [driver("a"), driver("b")], []);
    assert.equal(r.multiplier, 1);
    assert.equal(r.lines.length, 0);
  });

  it("adds per-female-driver enthusiasm", () => {
    const r = computeCarSponsorAppeal(
      ["a"],
      [driver("a", "female")],
      [],
    );
    assert.ok(r.multiplier > 1);
    assert.equal(r.lines[0]?.label.includes("female"), true);
  });

  it("stacks all-female lineup bonus when every driver is female", () => {
    const roster = [driver("a", "female"), driver("b", "female")];
    const r = computeCarSponsorAppeal(["a", "b"], roster, []);
    assert.ok(r.multiplier >= 1.14);
    assert.ok(r.lines.some((l) => l.label.includes("All-female")));
  });

  it("adds staff alignment bonus", () => {
    const staff: StaffMemberPayload[] = [
      { role: "engineer", name: "E", skill: 80, gender: "female" },
      { role: "strategist", name: "S", skill: 75, gender: "female" },
      { role: "mechanic", name: "M", skill: 70, gender: "female" },
    ];
    const r = computeCarSponsorAppeal(
      ["a", "b"],
      [driver("a", "male"), driver("b", "male")],
      staff,
    );
    assert.ok(r.lines.some((l) => l.label.includes("crew")));
  });
});

describe("applySponsorAppeal", () => {
  it("rounds inflated sponsor income", () => {
    assert.equal(applySponsorAppeal(50_000, 1.08), 54_000);
  });
});
