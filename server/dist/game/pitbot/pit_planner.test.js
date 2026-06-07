"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const pit_planner_1 = require("./pit_planner");
const stint_plan_1 = require("../../llm/stint_plan");
function snap(overrides) {
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
    };
    return { ...base, ...overrides };
}
const baseCtx = {
    phase: "race",
    wet: 0,
    sincePit: 5,
    setupDone: true,
    tyreTread: "slick",
};
(0, node_test_1.describe)("planPitStop class fuel thresholds", () => {
    (0, node_test_1.it)("uses earlier LMP2 low-fuel threshold (~38%)", () => {
        const above = (0, pit_planner_1.planPitStop)(snap({
            entryId: "e3",
            classId: "LMP2",
            lap: 5,
            fuel: 39,
            fuelTankCapacity: 100,
        }), baseCtx, 100);
        strict_1.default.equal(above, null);
        const at = (0, pit_planner_1.planPitStop)(snap({
            entryId: "e3",
            classId: "LMP2",
            lap: 5,
            fuel: 37,
            fuelTankCapacity: 100,
        }), baseCtx, 100);
        strict_1.default.ok(at);
        strict_1.default.ok(at?.services.fuel);
    });
    (0, node_test_1.it)("allows lap-1 pit when LMP2 fuel is critical", () => {
        const plan = (0, pit_planner_1.planPitStop)(snap({
            entryId: "e3",
            classId: "LMP2",
            lap: 1,
            fuel: 15,
            fuelTankCapacity: 100,
        }), { ...baseCtx, sincePit: 1 }, 100);
        strict_1.default.ok(plan);
        strict_1.default.ok(plan?.services.fuel);
    });
    (0, node_test_1.it)("blocks routine lap-1 pit when fuel is not critical", () => {
        const plan = (0, pit_planner_1.planPitStop)(snap({
            entryId: "e3",
            classId: "LMP2",
            lap: 1,
            fuel: 50,
            fuelTankCapacity: 100,
        }), { ...baseCtx, sincePit: 1 }, 100);
        strict_1.default.equal(plan, null);
    });
    (0, node_test_1.it)("uses earlier LMGT3 low-fuel threshold (~36%)", () => {
        const above = (0, pit_planner_1.planPitStop)(snap({
            classId: "LMGT3",
            lap: 5,
            fuel: 37,
            fuelTankCapacity: 100,
        }), baseCtx, 100);
        strict_1.default.equal(above, null);
        const at = (0, pit_planner_1.planPitStop)(snap({
            classId: "LMGT3",
            lap: 5,
            fuel: 35,
            fuelTankCapacity: 100,
        }), baseCtx, 100);
        strict_1.default.ok(at);
        strict_1.default.ok(at?.services.fuel);
    });
    (0, node_test_1.it)("uses Hypercar default tank when capacity missing", () => {
        const plan = (0, pit_planner_1.planPitStop)(snap({
            entryId: "e1",
            classId: "Hypercar",
            lap: 5,
            fuel: 28,
            fuelTankCapacity: undefined,
        }), baseCtx, 110);
        strict_1.default.ok(plan);
        strict_1.default.ok(plan?.services.fuel);
    });
});
(0, node_test_1.describe)("pit_planner rival aggression", () => {
    (0, node_test_1.it)("raises fuel thresholds when aggression is high", () => {
        const base = (0, pit_planner_1.scaledFuelThresholds)(1, { low: 0.3, critical: 0.14 });
        const aggressive = (0, pit_planner_1.scaledFuelThresholds)(1.15, { low: 0.3, critical: 0.14 });
        strict_1.default.ok(aggressive.low > base.low);
        strict_1.default.ok(aggressive.critical > base.critical);
    });
    (0, node_test_1.it)("lowers fuel thresholds when aggression is low", () => {
        const base = (0, pit_planner_1.scaledFuelThresholds)(1, { low: 0.3, critical: 0.14 });
        const conservative = (0, pit_planner_1.scaledFuelThresholds)(0.85, { low: 0.3, critical: 0.14 });
        strict_1.default.ok(conservative.low < base.low);
        strict_1.default.ok(conservative.critical < base.critical);
    });
});
(0, node_test_1.describe)("pit_planner stint guide", () => {
    (0, node_test_1.it)("pits earlier when AiStintGuide sets a higher fuel stop fraction", () => {
        const s = snap({
            classId: "Hypercar",
            lap: 5,
            fuel: 31,
            fuelTankCapacity: 100,
        });
        const withoutPlan = (0, pit_planner_1.planPitStop)(s, baseCtx, 100);
        strict_1.default.equal(withoutPlan, null);
        const stintPlan = (0, stint_plan_1.fallbackStintPlan)(s, 1);
        stintPlan.fuelStopFraction = 0.35;
        const withPlan = (0, pit_planner_1.planPitStop)(s, { ...baseCtx, stintPlan }, 100);
        strict_1.default.ok(withPlan);
        strict_1.default.ok(withPlan?.services.fuel);
    });
});
(0, node_test_1.describe)("planPitStop irreparable structural damage", () => {
    (0, node_test_1.it)("does not plan limp body repair when suspension is irreparable", () => {
        const s = snap({
            limpMode: "barely_driveable",
            partIrreparable: ["susp_fr", "susp_rr"],
            fuel: 20,
            tireWear: 0.9,
        });
        const plan = (0, pit_planner_1.planPitStop)(s, baseCtx, 100);
        strict_1.default.equal(plan, null);
    });
});
