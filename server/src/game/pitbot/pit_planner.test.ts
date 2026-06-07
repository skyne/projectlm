import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planPitStop, type PlannerSnap } from "./pit_planner";

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
