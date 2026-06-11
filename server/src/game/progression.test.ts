import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOffWeekTraining,
  applyPrivateTestProgression,
  applyWeekendProgression,
  collectWeekendParticipants,
  driverXpForPrivateTest,
  driverXpForWeekendSession,
  progressionLevel,
  staffXpForPrivateTest,
  staffXpForWeekendSession,
  xpIntoCurrentLevel,
} from "./progression";
import { defaultFacilities } from "./facilities";
import type { DriverProfilePayload } from "../ws_protocol";
import type { StaffMember } from "./staff";

const baseDriver = (id: string, name: string): DriverProfilePayload => ({
  id,
  name,
  nationality: "GB",
  tier: "Gold",
  dryPace: 80,
  wetPace: 78,
  consistency: 80,
  overtaking: 76,
  defending: 76,
  trafficManagement: 76,
  rollingStart: 74,
  standingStart: 74,
  setupFeedback: 70,
  tireManagement: 76,
  fuelSaving: 74,
  composure: 78,
  nightPace: 74,
  rainRadar: 70,
  stamina: 78,
  adaptability: 70,
  maxStintHours: 2.5,
});

const baseStaff = (id: string): StaffMember => ({
  id,
  role: "engineer",
  name: "Jean Dupont",
  skill: 72,
  experience: 10,
  salaryPerRace: 12000,
  morale: 80,
  assignedCarId: "car-1",
  status: "active",
});

describe("progression", () => {
  it("computes level and xp into current level", () => {
    assert.equal(progressionLevel(0), 1);
    assert.equal(progressionLevel(99), 1);
    assert.equal(progressionLevel(100), 2);
    assert.equal(xpIntoCurrentLevel(132), 32);
  });

  it("awards private test xp", () => {
    assert.equal(driverXpForPrivateTest(4), 32);
    assert.equal(staffXpForPrivateTest(4), 20);
  });

  it("applies driver level-up at 100 xp", () => {
    const drivers = [baseDriver("d1", "Marco")];
    drivers[0].progressionXp = 80;
    const { drivers: next, summary } = applyPrivateTestProgression(
      drivers,
      [],
      ["d1"],
      [],
      4,
    );
    assert.equal(summary.drivers[0]?.xpGained, 32);
    assert.equal(next[0].progressionXp, 112);
    // Level 2 rotates to stamina (after dryPace at level 1).
    assert.ok((next[0].stamina ?? 0) > 78);
  });

  it("scales private test xp with joint-testing multiplier", () => {
    const drivers = [baseDriver("d1", "Marco")];
    const { summary } = applyPrivateTestProgression(
      drivers,
      [],
      ["d1"],
      [],
      4,
      { xpMultiplier: 1.25 },
    );
    assert.equal(summary.drivers[0]?.xpGained, 40);
  });

  it("applies staff skill bump at threshold", () => {
    const staff = [baseStaff("s1")];
    staff[0].progressionXp = 85;
    const { staff: next, summary } = applyPrivateTestProgression(
      [],
      staff,
      [],
      ["s1"],
      4,
    );
    assert.equal(summary.staff[0]?.xpGained, 20);
    assert.equal(next[0].progressionXp, 105);
    // Engineer level 2 awards morale (odd levels = skill).
    assert.equal(next[0].morale, 81);
  });

  it("awards weekend session xp by type", () => {
    assert.ok(driverXpForWeekendSession("race") > driverXpForWeekendSession("practice"));
    assert.ok(staffXpForWeekendSession("race") >= staffXpForWeekendSession("qualifying"));
  });

  it("applies weekend progression to assigned roster", () => {
    const drivers = [baseDriver("d1", "Marco")];
    const staff = [baseStaff("s1")];
    const { summary } = applyWeekendProgression(
      drivers,
      staff,
      ["d1"],
      ["s1"],
      "qualifying",
    );
    assert.equal(summary.drivers[0]?.xpGained, driverXpForWeekendSession("qualifying"));
    assert.equal(summary.staff[0]?.xpGained, staffXpForWeekendSession("qualifying"));
  });

  it("collects weekend participants from fleet assignments", () => {
    const drivers = [baseDriver("d1", "Marco")];
    const staff = [baseStaff("s1")];
    const { driverIds, staffIds } = collectWeekendParticipants(
      ["car-1"],
      drivers,
      staff,
      { "car-1": ["d1"] },
    );
    assert.deepEqual(driverIds, ["d1"]);
    assert.deepEqual(staffIds, ["s1"]);
  });

  it("runs off-week driver simulator training", () => {
    const drivers = [baseDriver("d1", "Marco")];
    const result = applyOffWeekTraining(
      drivers,
      [],
      "driver_sim",
      { driverId: "d1" },
      defaultFacilities(),
    );
    assert.equal(result.error, undefined);
    assert.ok(result.summary.drivers[0]?.xpGained > 0);
  });
});
