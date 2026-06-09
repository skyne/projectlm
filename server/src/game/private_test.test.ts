import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canStartPrivateTest,
  clampPrivateTestDurationHours,
  isRaceWeekendInProgress,
  validatePrivateTestPayload,
} from "./private_test";
import type { CarBuildPayload, MetaStatePayload } from "../ws_protocol";

const minimalBuild = {
  carName: "Car 7",
  chassis_type: "lmp2",
  front_aero_type: "lmp2_front",
  rear_aero_type: "lmp2_rear",
  cooling_pack: "lmp2_cooling",
  wheel_package: "lmp2_wheels",
  suspension_layout: "lmp2_suspension",
  fuel_system: "lmp2_fuel",
  brake_system: "lmp2_brakes",
  transmission: "lmp2_gearbox",
  hybrid_system: "none",
} as CarBuildPayload;

function baseMeta(overrides: Partial<MetaStatePayload> = {}): MetaStatePayload {
  return {
    teamName: "Test Team",
    budget: 1_000_000,
    rdPoints: 0,
    playerEntryId: "entry-1",
    staff: [],
    sponsors: [],
    unlockedParts: [],
    calendar: [
      {
        round: 1,
        trackId: "spa",
        format: "6h",
        eventType: "race",
        completed: false,
        championshipPoints: 0,
      },
    ],
    currentRound: 1,
    setupComplete: true,
    fleet: [
      {
        id: "car-1",
        carNumber: "7",
        classId: "Hypercar",
        carConfigPath: "configs/car.txt",
        affiliation: "privateer",
        acquisition: "privateer",
        assignedDriverIds: ["d1"],
        build: minimalBuild,
      },
    ],
    driverRoster: [
      {
        id: "d1",
        name: "Driver One",
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
        maxStintHours: 2.5,
      },
    ],
    seasonYear: 2026,
    ...overrides,
  };
}

describe("private_test", () => {
  it("clamps duration hours", () => {
    assert.equal(clampPrivateTestDurationHours(0.2), 1);
    assert.equal(clampPrivateTestDurationHours(4.6), 5);
    assert.equal(clampPrivateTestDurationHours(100), 72);
  });

  it("blocks during active race weekend", () => {
    const meta = baseMeta({
      weekendProgress: { round: 1, completedSessions: ["practice"] },
    });
    assert.equal(isRaceWeekendInProgress(meta), true);
    assert.equal(canStartPrivateTest(meta), false);
  });

  it("allows private test before weekend starts", () => {
    const meta = baseMeta();
    assert.equal(canStartPrivateTest(meta), true);
  });

  it("validates payload", () => {
    const meta = baseMeta();
    const result = validatePrivateTestPayload(meta, {
      trackId: "spa",
      carIds: ["car-1"],
      driverAssignments: { "car-1": ["d1"] },
      durationHours: 4,
    });
    assert.ok("payload" in result);
    if ("payload" in result) {
      assert.equal(result.payload.durationHours, 4);
    }
  });
});
