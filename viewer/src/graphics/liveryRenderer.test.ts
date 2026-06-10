import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultLiveryVisual,
  pickHypercarChassis,
  HYPERCAR_CHASSIS_IDS,
} from "./liveryRenderer";

describe("liveryRenderer defaults", () => {
  it("pickHypercarChassis is stable for the same team name", () => {
    const a = pickHypercarChassis("Alpine Motorsport");
    const b = pickHypercarChassis("Alpine Motorsport");
    assert.equal(a, b);
    assert.ok(HYPERCAR_CHASSIS_IDS.includes(a));
  });

  it("defaultLiveryVisual uses hypercar compositor parts", () => {
    const build = defaultLiveryVisual("Hypercar", "Test Team");
    assert.equal(build.hybrid_system, "LMDh50kW");
    assert.equal(build.wheel_package, "Hypercar18WideRear");
    assert.ok(HYPERCAR_CHASSIS_IDS.includes(build.chassis_type as (typeof HYPERCAR_CHASSIS_IDS)[number]));
  });

  it("defaultLiveryVisual maps LMGT3 and LMP2", () => {
    assert.equal(defaultLiveryVisual("LMGT3").chassis_type, "GT3Spaceframe");
    assert.equal(defaultLiveryVisual("LMP2").chassis_type, "Oreca07");
  });
});
