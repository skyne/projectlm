import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EngineBuildPayload } from "../ws_protocol.js";
import { validateEngineBuild } from "./engine_model.js";

describe("validateEngineBuild", () => {
  it("accepts Electric BEV at 680 hp (motor torque exceeds ICE cap)", () => {
    const engine: EngineBuildPayload = {
      engine_layout: "V6",
      fuel_type: "Electric",
      cylinders: 6,
      bore: 0,
      stroke: 0,
      max_rpm: 12000,
      peak_torque_nm: Math.round(680 * 4.2),
      peak_torque_rpm: 10200,
      base_vibration: 0.2,
      aspiration: "NA",
      drivetrain: "FullEV",
      power_target: 680,
    };
    assert.equal(validateEngineBuild(engine), null);
  });

  it("accepts gasoline FullEV with motor-model torque", () => {
    const engine: EngineBuildPayload = {
      engine_layout: "V6",
      fuel_type: "Gasoline",
      cylinders: 6,
      bore: 0.08,
      stroke: 0.06,
      max_rpm: 12000,
      peak_torque_nm: Math.round(680 * 4.2),
      peak_torque_rpm: 10200,
      base_vibration: 0.2,
      aspiration: "NA",
      drivetrain: "FullEV",
      power_target: 680,
    };
    assert.equal(validateEngineBuild(engine), null);
  });

  it("still rejects ICE torque above 1200 Nm", () => {
    const engine: EngineBuildPayload = {
      engine_layout: "V8",
      fuel_type: "Gasoline",
      cylinders: 8,
      bore: 0.095,
      stroke: 0.078,
      max_rpm: 8500,
      peak_torque_nm: 1300,
      peak_torque_rpm: 6500,
      base_vibration: 1.0,
      aspiration: "TwinParallel",
      drivetrain: "FrontAxleHybrid",
    };
    assert.equal(validateEngineBuild(engine), "Peak torque out of range");
  });
});
