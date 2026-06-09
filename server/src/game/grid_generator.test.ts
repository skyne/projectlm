import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { generateJointPrivateTestGrid, generatePlayerOnlyGrid } from "./grid_generator";
import type { CarBuildPayload, FleetCarPayload } from "../ws_protocol";

const repoRoot = path.resolve(process.cwd(), "..");

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

  it("adds partner team entries from the Le Mans entry list", () => {
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
    ];

    const entries = generateJointPrivateTestGrid({
      repoRoot,
      playerTeamName: "My Team",
      playerFleet: fleet,
      partnerTeams: ["Peugeot TotalEnergies"],
    });

    assert.ok(entries.length > 1);
    assert.equal(entries[0]?.isPlayer, true);
    assert.ok(entries.some((e) => e.teamName === "Peugeot TotalEnergies" && !e.isPlayer));
  });
});
