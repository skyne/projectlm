import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  burnScaledFuelBase,
  hasSevereCarIssue,
  mustServePenalty,
  needsEmergencyPit,
  PENALTY_SERVE_FUEL_BUFFER_LAPS,
  shouldServeDeferrablePenaltyNow,
  planPitStop,
  planRedFlagEmergencyPit,
  scaledFuelThresholds,
  shouldDeferPitForRaceControl,
  type PlannerSnap,
} from "./pit_planner";
import { fallbackStintPlan } from "../../llm/stint_plan";
import { resolveBriefingTactics } from "../briefing_tactics";

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
    // fuelAtLastPit 55 → measured burn 5 L/lap, so 50 L is ~10 laps of fuel.
    const plan = planPitStop(
      snap({
        entryId: "e3",
        classId: "LMP2",
        lap: 1,
        fuel: 50,
        fuelTankCapacity: 100,
      }),
      { ...baseCtx, sincePit: 1 },
      55,
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

describe("pit_planner briefing fuel", () => {
  it("quali_sim briefing tops up only to partial fuel target on setup pit", () => {
    const s = snap({
      lap: 3,
      fuel: 8,
      fuelTankCapacity: 110,
    });
    const tactics = resolveBriefingTactics(
      { carId: "c1", briefingId: "quali_sim" },
      "practice",
      "Hypercar",
    );
    const plan = planPitStop(
      s,
      {
        phase: "practice",
        wet: 0,
        sincePit: 2,
        setupDone: false,
        tyreTread: "slick",
        briefingTactics: tactics,
      },
      8,
    );
    assert.ok(plan);
    const fuelPart = plan!.parts.find((p) => p.startsWith("fuel="));
    assert.ok(fuelPart);
    const liters = Number(fuelPart!.slice("fuel=".length));
    assert.ok(liters > 0);
    assert.ok(liters < 60);
    assert.ok(liters + s.fuel < s.fuelTankCapacity!);
  });

  it("long_stint briefing fills toward full tank on setup pit", () => {
    const s = snap({
      lap: 3,
      fuel: 40,
      fuelTankCapacity: 110,
    });
    const tactics = resolveBriefingTactics(
      { carId: "c1", briefingId: "long_stint" },
      "practice",
      "Hypercar",
    );
    const plan = planPitStop(
      s,
      {
        phase: "practice",
        wet: 0,
        sincePit: 2,
        setupDone: false,
        tyreTread: "slick",
        briefingTactics: tactics,
      },
      40,
    );
    assert.ok(plan);
    const fuelPart = plan!.parts.find((p) => p.startsWith("fuel="));
    assert.ok(fuelPart);
    const liters = Number(fuelPart!.slice("fuel=".length));
    assert.ok(liters >= 60);
  });
});

describe("pit_planner stint guide", () => {
  it("pits earlier when AiStintGuide sets a higher fuel stop fraction", () => {
    const s = snap({
      classId: "Hypercar",
      lap: 5,
      fuel: 34,
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
    assert.equal(
      shouldDeferPitForRaceControl({
        flagPhase: "red_flag",
        fcyActive: false,
        scActive: false,
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

  it("hasSevereCarIssue detects flats, limp, and body damage", () => {
    assert.equal(hasSevereCarIssue(snap({ tyreDeflation: { FL: "flat" } })), true);
    assert.equal(hasSevereCarIssue(snap({ limpMode: "barely_driveable" })), true);
    assert.equal(hasSevereCarIssue(snap({ limpMode: "reduced_power" })), true);
    assert.equal(
      hasSevereCarIssue(snap({ partHealth: { body_fl: 50 }, engineHealth: 95 })),
      true,
    );
    assert.equal(hasSevereCarIssue(snap({ engineHealth: 70 })), true);
    assert.equal(hasSevereCarIssue(snap({ engineHealth: 95 })), false);
  });

  it("shouldServeDeferrablePenaltyNow defers when fuel or damage needs service first", () => {
    const lowFuel = snap({
      pendingPenalty: "stop_go",
      lapsToComply: 3,
      fuel: 3,
      fuelTankCapacity: 100,
      lap: 10,
    });
    const sincePit = 5;
    const fuelAtLastPit = 13;
    assert.equal(
      shouldServeDeferrablePenaltyNow(lowFuel, sincePit, fuelAtLastPit),
      false,
    );
    assert.equal(
      shouldServeDeferrablePenaltyNow(
        snap({
          ...lowFuel,
          fuel: PENALTY_SERVE_FUEL_BUFFER_LAPS * 2,
        }),
        sincePit,
        fuelAtLastPit,
      ),
      true,
    );
    assert.equal(
      shouldServeDeferrablePenaltyNow(
        snap({ ...lowFuel, pendingPenalty: "black" }),
        sincePit,
        fuelAtLastPit,
      ),
      true,
    );
    assert.equal(
      shouldServeDeferrablePenaltyNow(
        snap({
          pendingPenalty: "drive_through",
          lapsToComply: 3,
          fuel: 50,
          fuelTankCapacity: 100,
          tyreDeflation: { RR: "flat" },
        }),
        sincePit,
        fuelAtLastPit,
      ),
      false,
    );
  });
});

describe("planRedFlagEmergencyPit", () => {
  it("needsEmergencyPit includes deflated tyres", () => {
    assert.equal(needsEmergencyPit(snap({ tyreDeflation: { FL: "flat" } })), true);
    assert.equal(needsEmergencyPit(snap({ tyreDeflation: {} })), false);
  });

  it("allows only deflated wheel and blocks strategic fuel", () => {
    const plan = planRedFlagEmergencyPit(
      snap({
        fuel: 80,
        fuelTankCapacity: 100,
        tyreDeflation: { FL: "flat" },
      }),
      { wet: 0 },
    );
    assert.ok(plan);
    assert.ok(plan!.parts.some((p) => p.includes("tires=FL")));
    assert.ok(!plan!.parts.some((p) => p.startsWith("fuel=") && !p.includes("fuel=0")));
    assert.ok(!plan!.services.driver);
  });

  it("caps low-fuel top-up and excludes driver swap", () => {
    const plan = planRedFlagEmergencyPit(
      snap({ fuel: 10, fuelTankCapacity: 100 }),
      { wet: 0 },
    );
    assert.ok(plan);
    assert.match(plan!.parts.join("|"), /fuel=15/);
    assert.ok(!plan!.parts.some((p) => p.includes("driver_change")));
  });

  it("returns null for routine wear without emergency trigger", () => {
    const plan = planRedFlagEmergencyPit(
      snap({ fuel: 60, fuelTankCapacity: 100, tireWear: 0.95 }),
      { wet: 0 },
    );
    assert.equal(plan, null);
  });
});

describe("burnScaledFuelBase", () => {
  it("keeps class floor on long-range tanks (Hypercar LM burn)", () => {
    const s = snap({ fuel: 40, fuelTankCapacity: 110 });
    const { low, critical } = burnScaledFuelBase(s, 3, 76);
    assert.ok(low <= 0.35);
    assert.ok(critical <= 0.2);
  });

  it("does not force 1-lap stints on short-range REX tanks", () => {
    const s = snap({ fuel: 55, fuelTankCapacity: 85 });
    const { low, critical } = burnScaledFuelBase(s, 1, 85);
    assert.ok(low < 0.65, `low=${low}`);
    assert.ok(critical < 0.45, `critical=${critical}`);
    assert.ok(55 / 85 > low, "one lap of burn should stay above low threshold");
    assert.ok(55 / 85 > critical, "one lap of burn should stay above critical");
  });

  it("still pits REX after two laps of burn", () => {
    const s = snap({ fuel: 24, fuelTankCapacity: 85 });
    const { low, critical } = burnScaledFuelBase(s, 2, 85);
    assert.ok(24 / 85 < low);
    assert.ok(24 / 85 < critical);
  });

  it("uses class floor on lap 1 after a stop (pit-out skew)", () => {
    const s = snap({ fuel: 34, fuelTankCapacity: 85 });
    const { low, critical } = burnScaledFuelBase(s, 1, 85);
    assert.equal(low, 0.3);
    assert.equal(critical, 0.14);
    assert.ok(34 / 85 > low);
  });
});

describe("planPitStop when session repair is not viable", () => {
  it("does not plan limp repair when session time is insufficient", () => {
    const s = snap({
      limpMode: "barely_driveable",
      sessionRepairable: false,
      totalRepairSec: 900,
      remainingSessionSec: 300,
      fuel: 20,
      tireWear: 0.9,
    });
    const plan = planPitStop(s, baseCtx, 100);
    assert.equal(plan, null);
  });
});