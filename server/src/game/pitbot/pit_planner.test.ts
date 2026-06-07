import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mustServePenalty,
  planPitStop,
  scaledFuelThresholds,
  shouldDeferPitForRaceControl,
  type PlannerSnap,
} from "./pit_planner";
import { fallbackStintPlan } from "../../llm/stint_plan";

function snap(overrides: Partial<PlannerSnap>): PlannerSnap {
  const base = {
    entryId: "e1",
    teamName: "Test Team",
    carNumber: "99",
    classId: "Hypercar",
    lap: 5,
    distance: 1000,
    normalizedT: 0.1,
    speed: 80,
    rpm: 6000,
    fuel: 50,
    tireWear: 0.2,
    tireCompound: "soft",
    engineHealth: 100,
    sectorIndex: 0,
    racePosition: 1,
    classPosition: 1,
    inPit: false,
    retired: false,
    currentLapTime: 265,
    currentSectorTime: 88,
    lastLapTime: 265,
    bestLapTime: 260,
    gapToLeader: 0,
    currentLapSectorTimes: [88, 88, 89],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    fuelTankCapacity: 100,
  } satisfies PlannerSnap;
  return { ...base, ...overrides };
}

const baseCtx = {
  phase: "race" as const,
  wet: 0,
  sincePit: 5,
  setupDone: true,
  tyreTread: "slick" as const,
};

describe("planPitStop class fuel thresholds", () => {
  it("uses earlier LMP2 low-fuel threshold (~38%)", () => {
    const above = planPitStop(
      snap({
        entryId: "e3",
        classId: "LMP2",
        lap: 5,
        fuel: 39,
        fuelTankCapacity: 100,
      }),
      baseCtx,
      100,
    );
    assert.equal(above, null);

    const at = planPitStop(
      snap({
        entryId: "e3",
        classId: "LMP2",
        lap: 5,
        fuel: 37,
        fuelTankCapacity: 100,
      }),
      baseCtx,
      100,
    );
    assert.ok(at);
    assert.ok(at?.services.fuel);
  });

  it("allows lap-1 pit when LMP2 fuel is critical", () => {
    const plan = planPitStop(
      snap({
        entryId: "e3",
        classId: "LMP2",
        lap: 1,
        fuel: 15,
        fuelTankCapacity: 100,
      }),
      { ...baseCtx, sincePit: 1 },
      100,
    );
    assert.ok(plan);
    assert.ok(plan?.services.fuel);
  });

  it("blocks routine lap-1 pit when fuel is not critical", () => {
    const plan = planPitStop(
      snap({
        entryId: "e3",
        classId: "LMP2",
        lap: 1,
        fuel: 50,
        fuelTankCapacity: 100,
      }),
      { ...baseCtx, sincePit: 1 },
      100,
    );
    assert.equal(plan, null);
  });

  it("uses earlier LMGT3 low-fuel threshold (~36%)", () => {
    const above = planPitStop(
      snap({
        classId: "LMGT3",
        lap: 5,
        fuel: 37,
        fuelTankCapacity: 100,
      }),
      baseCtx,
      100,
    );
    assert.equal(above, null);

    const at = planPitStop(
      snap({
        classId: "LMGT3",
        lap: 5,
        fuel: 35,
        fuelTankCapacity: 100,
      }),
      baseCtx,
      100,
    );
    assert.ok(at);
    assert.ok(at?.services.fuel);
  });

  it("uses Hypercar default tank when capacity missing", () => {
    const plan = planPitStop(
      snap({
        entryId: "e1",
        classId: "Hypercar",
        lap: 5,
        fuel: 28,
        fuelTankCapacity: undefined,
      }),
      baseCtx,
      110,
    );
    assert.ok(plan);
    assert.ok(plan?.services.fuel);
  });
});

describe("pit_planner rival aggression", () => {
  it("raises fuel thresholds when aggression is high", () => {
    const base = scaledFuelThresholds(1, { low: 0.3, critical: 0.14 });
    const aggressive = scaledFuelThresholds(1.15, { low: 0.3, critical: 0.14 });
    assert.ok(aggressive.low > base.low);
    assert.ok(aggressive.critical > base.critical);
  });

  it("lowers fuel thresholds when aggression is low", () => {
    const base = scaledFuelThresholds(1, { low: 0.3, critical: 0.14 });
    const conservative = scaledFuelThresholds(0.85, { low: 0.3, critical: 0.14 });
    assert.ok(conservative.low < base.low);
    assert.ok(conservative.critical < base.critical);
  });
});

describe("pit_planner stint guide", () => {
  it("pits earlier when AiStintGuide sets a higher fuel stop fraction", () => {
    const s = snap({
      classId: "Hypercar",
      lap: 5,
      fuel: 31,
      fuelTankCapacity: 100,
    });
    const withoutPlan = planPitStop(s, baseCtx, 100);
    assert.equal(withoutPlan, null);

    const stintPlan = fallbackStintPlan(s, 1);
    stintPlan.fuelStopFraction = 0.35;
    const withPlan = planPitStop(
      s,
      { ...baseCtx, stintPlan },
      100,
    );
    assert.ok(withPlan);
    assert.ok(withPlan?.services.fuel);
  });
});

describe("pit_planner race control helpers", () => {
  it("shouldDeferPitForRaceControl under FCY, SC, slow zone, and green", () => {
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "green",
        fcyActive: false,
        scActive: false,
      }),
      false,
    );
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "fcy",
        fcyActive: true,
        scActive: false,
      }),
      true,
    );
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "sc",
        fcyActive: false,
        scActive: true,
      }),
      true,
    );
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "slow_zone",
        fcyActive: false,
        scActive: false,
      }),
      true,
    );
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "sc_in_lap",
        fcyActive: false,
        scActive: true,
      }),
      true,
    );
  });

  it("shouldDeferPitForRaceControl returns false when race control payload missing", () => {
    assert.equal(shouldDeferPitForRaceControl(undefined), false);
  });

  it("mustServePenalty when laps remain or black flag is pending", () => {
    assert.equal(
      mustServePenalty(
        snap({ pendingPenalty: "none", lapsToComply: 3 }),
      ),
      false,
    );
    assert.equal(
      mustServePenalty(
        snap({ pendingPenalty: "drive_through", lapsToComply: 0 }),
      ),
      false,
    );
    assert.equal(
      mustServePenalty(
        snap({ pendingPenalty: "drive_through", lapsToComply: 2 }),
      ),
      true,
    );
    assert.equal(
      mustServePenalty(
        snap({ pendingPenalty: "black", lapsToComply: 0 }),
      ),
      true,
    );
    assert.equal(
      mustServePenalty(
        snap({ pendingPenalty: "stop_go", lapsToComply: 1 }),
      ),
      true,
    );
  });
});

describe("planPitStop irreparable structural damage", () => {
  it("does not plan limp body repair when suspension is irreparable", () => {
    const s = snap({
      limpMode: "barely_driveable",
      partIrreparable: ["susp_fr", "susp_rr"],
      fuel: 20,
      tireWear: 0.9,
    });
    const plan = planPitStop(s, baseCtx, 100);
    assert.equal(plan, null);
  });
});