import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDevelopCategory,
  defaultFacilities,
  facilityTrainingMultiplier,
} from "./facilities";

describe("facilities", () => {
  it("defaults all facilities to tier 0", () => {
    const fac = defaultFacilities();
    assert.equal(fac.length, 5);
    assert.ok(fac.every((f) => f.tier === 0));
  });

  it("gates chassis dev on carbon fab + design studio", () => {
    const fac = defaultFacilities();
    assert.equal(canDevelopCategory(fac, "chassis"), false);
    const built = fac.map((f) =>
      f.id === "carbon_fab" || f.id === "design_studio"
        ? { ...f, tier: 1 }
        : f,
    );
    assert.equal(canDevelopCategory(built, "chassis"), true);
  });

  it("boosts training with wind tunnel and dyno", () => {
    const base = facilityTrainingMultiplier(defaultFacilities());
    const built = defaultFacilities().map((f) =>
      f.id === "wind_tunnel" || f.id === "dyno_cell" ? { ...f, tier: 1 } : f,
    );
    assert.ok(facilityTrainingMultiplier(built) > base);
  });
});
