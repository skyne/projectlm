import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  strategistSkillFromStaff,
  teammateSupportReleaseDelaySec,
  teammateYieldThresholdSec,
} from "./staff_briefing";

describe("staff_briefing", () => {
  it("lowers yield threshold as strategist skill rises", () => {
    const low = teammateYieldThresholdSec(20);
    const high = teammateYieldThresholdSec(90);
    assert.ok(low > high);
    assert.ok(low <= 0.8);
    assert.ok(high >= 0.15);
  });

  it("reads assigned strategist skill per car", () => {
    const skill = strategistSkillFromStaff(
      [
        {
          id: "s1",
          role: "strategist",
          name: "A",
          skill: 80,
          experience: 1,
          salaryPerRace: 1,
          morale: 1,
          assignedCarId: "car-a",
          status: "active",
        },
        {
          id: "s2",
          role: "strategist",
          name: "B",
          skill: 40,
          experience: 1,
          salaryPerRace: 1,
          morale: 1,
          assignedCarId: "car-b",
          status: "active",
        },
      ],
      "car-a",
    );
    assert.equal(skill, 80);
  });

  it("shortens support release delay with higher skill", () => {
    assert.ok(teammateSupportReleaseDelaySec(90) < teammateSupportReleaseDelaySec(30));
  });
});
