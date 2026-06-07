import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { EngineBuildPayload } from "../ws_protocol.js";

// Mirror viewer trait rules for server-side sanity checks.
function isFuelCellBuild(engine: EngineBuildPayload): boolean {
  return engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell";
}

describe("H2 fuel cell build encoding", () => {
  it("detects fuel cell from energy_converter", () => {
    const fc: EngineBuildPayload = {
      engine_layout: "V6",
      fuel_type: "Hydrogen",
      energy_converter: "FuelCell",
      cylinders: 6,
      bore: 0.08,
      stroke: 0.06,
      max_rpm: 12000,
      peak_torque_nm: 500,
      peak_torque_rpm: 10200,
      base_vibration: 0.2,
      drivetrain: "FullEV",
      generator_kw: 420,
    };
    assert.equal(isFuelCellBuild(fc), true);
  });

  it("combustion H2 is not fuel cell", () => {
    const ice: EngineBuildPayload = {
      engine_layout: "V6",
      fuel_type: "Hydrogen",
      energy_converter: "Combustion",
      cylinders: 6,
      bore: 0.086,
      stroke: 0.075,
      max_rpm: 8500,
      peak_torque_nm: 700,
      peak_torque_rpm: 6500,
      base_vibration: 1,
      drivetrain: "FrontAxleHybrid",
    };
    assert.equal(isFuelCellBuild(ice), false);
  });
});
