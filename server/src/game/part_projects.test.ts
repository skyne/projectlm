import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultFacilities } from "./facilities";
import { newPartInstance } from "./part_instances";
import {
  applyPartProject,
  PART_PROJECT_RD_COST,
  validatePartProject,
} from "./part_projects";

describe("part_projects", () => {
  const part = newPartInstance("wing.hyper", "rear_aero", "aero", "inhouse");

  it("rejects without facility", () => {
    const err = validatePartProject(
      part,
      defaultFacilities(),
      PART_PROJECT_RD_COST,
      100_000,
      "performance",
    );
    assert.match(err ?? "", /facility/i);
  });

  it("applies performance focus with engineer skill", () => {
    const facilities = defaultFacilities().map((f) =>
      f.id === "wind_tunnel" ? { ...f, tier: 1 } : f,
    );
    assert.equal(
      validatePartProject(part, facilities, PART_PROJECT_RD_COST, 100_000, "performance"),
      null,
    );
    const next = applyPartProject(part, "performance", 90);
    assert.ok(next.performanceMaturity > part.performanceMaturity);
  });
});
