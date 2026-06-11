import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FleetCarPayload } from "../ws_protocol";
import { mergePartInstancesFromFleet, partTypesFromBuild } from "./part_instance_seed";

const sampleBuild = {
  carName: "Test Car",
  chassis_type: "LMDhDallara",
  front_aero_type: "LowDragNose",
  rear_aero_type: "StandardWing",
  diffuser_type: "StockFloor",
  exhaust_type: "TwinOutletSide",
  cooling_pack: "EnduranceHeavyDuty",
  wheel_package: "Hypercar18Standard",
  suspension_layout: "PushrodDoubleWishbone",
  fuel_system: "LeMans110L",
  brake_system: "BremboHypercar",
  transmission: "XtracP1359",
  hybrid_system: "LMDh50kW",
};

describe("part_instance_seed", () => {
  it("extracts catalog ids from a build", () => {
    const rows = partTypesFromBuild(sampleBuild);
    assert.ok(rows.some((r) => r.catalogId === "chassis.LMDhDallara"));
    assert.ok(rows.some((r) => r.catalogId === "brake.BremboHypercar"));
    assert.ok(!rows.some((r) => r.catalogId.includes("None")));
  });

  it("seeds inhouse instances for manufacturer builds", () => {
    const car: FleetCarPayload = {
      id: "car-1",
      carNumber: "1",
      classId: "Hypercar",
      affiliation: "manufacturer",
      acquisition: "build",
      build: sampleBuild,
      carConfigPath: "configs/fleet/car-1.txt",
    };
    const merged = mergePartInstancesFromFleet([], [car]);
    assert.ok(merged.length >= 10);
    assert.ok(merged.every((p) => p.source === "inhouse"));
  });

  it("does not duplicate existing catalog ids", () => {
    const car: FleetCarPayload = {
      id: "car-1",
      carNumber: "1",
      classId: "LMP2",
      affiliation: "privateer",
      acquisition: "privateer",
      build: sampleBuild,
      carConfigPath: "configs/fleet/car-1.txt",
    };
    const first = mergePartInstancesFromFleet([], [car]);
    const second = mergePartInstancesFromFleet(first, [car]);
    assert.equal(second.length, first.length);
    assert.ok(second.every((p) => p.source === "licensed"));
  });
});
