import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePlayerOnlyGrid } from "./grid_generator";
import type { CarBuildPayload, FleetCarPayload } from "../ws_protocol";

const minimalBuild = {
  carName: "Test",
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

describe("generatePlayerOnlyGrid", () => {
  it("creates player-only entries", () => {
    const fleet: FleetCarPayload[] = [
      {
        id: "car-a",
        carNumber: "7",
        classId: "Hypercar",
        carConfigPath: "configs/a.txt",
        affiliation: "privateer",
        acquisition: "privateer",
        build: { ...minimalBuild, carName: "A" },
      },
      {
        id: "car-b",
        carNumber: "8",
        classId: "Hypercar",
        carConfigPath: "configs/b.txt",
        affiliation: "privateer",
        acquisition: "privateer",
        build: { ...minimalBuild, carName: "B" },
      },
    ];

    const entries = generatePlayerOnlyGrid({
      playerTeamName: "My Team",
      playerFleet: fleet,
      playerCarId: "car-a",
    });

    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.isPlayer));
    assert.ok(entries.every((e) => e.teamName === "My Team"));
    assert.deepEqual(
      entries.map((e) => e.fleetCarId),
      ["car-a", "car-b"],
    );
  });
});
