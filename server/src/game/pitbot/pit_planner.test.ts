import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scaledFuelThresholds } from "./pit_planner";

describe("pit_planner rival aggression", () => {
  it("raises fuel thresholds when aggression is high", () => {
    const base = scaledFuelThresholds(1);
    const aggressive = scaledFuelThresholds(1.15);
    assert.ok(aggressive.low > base.low);
    assert.ok(aggressive.critical > base.critical);
  });

  it("lowers fuel thresholds when aggression is low", () => {
    const base = scaledFuelThresholds(1);
    const conservative = scaledFuelThresholds(0.85);
    assert.ok(conservative.low < base.low);
    assert.ok(conservative.critical < base.critical);
  });
});
