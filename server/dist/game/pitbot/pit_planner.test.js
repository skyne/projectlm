"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const pit_planner_1 = require("./pit_planner");
const stint_plan_1 = require("../../llm/stint_plan");
const briefing_tactics_1 = require("../briefing_tactics");
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
(0, node_test_1.describe)("pit_planner briefing fuel", () => {
    (0, node_test_1.it)("quali_sim briefing tops up only to partial fuel target on setup pit", () => {
        const s = snap({
            lap: 3,
            fuel: 8,
            fuelTankCapacity: 110,
        });
        const tactics = (0, briefing_tactics_1.resolveBriefingTactics)({ carId: "c1", briefingId: "quali_sim" }, "practice", "Hypercar");
        const plan = (0, pit_planner_1.planPitStop)(s, {
            phase: "practice",
            wet: 0,
            sincePit: 2,
            setupDone: false,
            tyreTread: "slick",
            briefingTactics: tactics,
        }, 8);
        strict_1.default.ok(plan);
        const fuelPart = plan.parts.find((p) => p.startsWith("fuel="));
        strict_1.default.ok(fuelPart);
        const liters = Number(fuelPart.slice("fuel=".length));
        strict_1.default.ok(liters > 0);
        strict_1.default.ok(liters < 60);
        strict_1.default.ok(liters + s.fuel < s.fuelTankCapacity);
    });
    (0, node_test_1.it)("long_stint briefing fills toward full tank on setup pit", () => {
        const s = snap({
            lap: 3,
            fuel: 40,
            fuelTankCapacity: 110,
        });
        const tactics = (0, briefing_tactics_1.resolveBriefingTactics)({ carId: "c1", briefingId: "long_stint" }, "practice", "Hypercar");
        const plan = (0, pit_planner_1.planPitStop)(s, {
            phase: "practice",
            wet: 0,
            sincePit: 2,
            setupDone: false,
            tyreTread: "slick",
            briefingTactics: tactics,
        }, 40);
        strict_1.default.ok(plan);
        const fuelPart = plan.parts.find((p) => p.startsWith("fuel="));
        strict_1.default.ok(fuelPart);
        const liters = Number(fuelPart.slice("fuel=".length));
        strict_1.default.ok(liters >= 60);
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
(0, node_test_1.describe)("pit_planner race control helpers", () => {
    (0, node_test_1.it)("shouldDeferPitForRaceControl under FCY, SC, slow zone, and green", () => {
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "green",
            fcyActive: false,
            scActive: false,
        }), false);
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "fcy",
            fcyActive: true,
            scActive: false,
        }), true);
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "sc",
            fcyActive: false,
            scActive: true,
        }), true);
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "slow_zone",
            fcyActive: false,
            scActive: false,
        }), true);
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "sc_in_lap",
            fcyActive: false,
            scActive: true,
        }), true);
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)({
            flagPhase: "red_flag",
            fcyActive: false,
            scActive: false,
        }), true);
    });
    (0, node_test_1.it)("shouldDeferPitForRaceControl returns false when race control payload missing", () => {
        strict_1.default.equal((0, pit_planner_1.shouldDeferPitForRaceControl)(undefined), false);
    });
    (0, node_test_1.it)("mustServePenalty when laps remain or black flag is pending", () => {
        strict_1.default.equal((0, pit_planner_1.mustServePenalty)(snap({ pendingPenalty: "none", lapsToComply: 3 })), false);
        strict_1.default.equal((0, pit_planner_1.mustServePenalty)(snap({ pendingPenalty: "drive_through", lapsToComply: 0 })), false);
        strict_1.default.equal((0, pit_planner_1.mustServePenalty)(snap({ pendingPenalty: "drive_through", lapsToComply: 2 })), true);
        strict_1.default.equal((0, pit_planner_1.mustServePenalty)(snap({ pendingPenalty: "black", lapsToComply: 0 })), true);
        strict_1.default.equal((0, pit_planner_1.mustServePenalty)(snap({ pendingPenalty: "stop_go", lapsToComply: 1 })), true);
    });
    (0, node_test_1.it)("hasSevereCarIssue detects flats, limp, and body damage", () => {
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ tyreDeflation: { FL: "flat" } })), true);
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ limpMode: "barely_driveable" })), true);
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ limpMode: "reduced_power" })), true);
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ partHealth: { body_fl: 50 }, engineHealth: 95 })), true);
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ engineHealth: 70 })), true);
        strict_1.default.equal((0, pit_planner_1.hasSevereCarIssue)(snap({ engineHealth: 95 })), false);
    });
    (0, node_test_1.it)("shouldServeDeferrablePenaltyNow defers when fuel or damage needs service first", () => {
        const lowFuel = snap({
            pendingPenalty: "stop_go",
            lapsToComply: 3,
            fuel: 3,
            fuelTankCapacity: 100,
            lap: 10,
        });
        const sincePit = 5;
        const fuelAtLastPit = 13;
        strict_1.default.equal((0, pit_planner_1.shouldServeDeferrablePenaltyNow)(lowFuel, sincePit, fuelAtLastPit), false);
        strict_1.default.equal((0, pit_planner_1.shouldServeDeferrablePenaltyNow)(snap({
            ...lowFuel,
            fuel: pit_planner_1.PENALTY_SERVE_FUEL_BUFFER_LAPS * 2,
        }), sincePit, fuelAtLastPit), true);
        strict_1.default.equal((0, pit_planner_1.shouldServeDeferrablePenaltyNow)(snap({ ...lowFuel, pendingPenalty: "black" }), sincePit, fuelAtLastPit), true);
        strict_1.default.equal((0, pit_planner_1.shouldServeDeferrablePenaltyNow)(snap({
            pendingPenalty: "drive_through",
            lapsToComply: 3,
            fuel: 50,
            fuelTankCapacity: 100,
            tyreDeflation: { RR: "flat" },
        }), sincePit, fuelAtLastPit), false);
    });
});
(0, node_test_1.describe)("planRedFlagEmergencyPit", () => {
    (0, node_test_1.it)("needsEmergencyPit includes deflated tyres", () => {
        strict_1.default.equal((0, pit_planner_1.needsEmergencyPit)(snap({ tyreDeflation: { FL: "flat" } })), true);
        strict_1.default.equal((0, pit_planner_1.needsEmergencyPit)(snap({ tyreDeflation: {} })), false);
    });
    (0, node_test_1.it)("needsEmergencyPit ignores depleted hybrid on parallel hypercars", () => {
        strict_1.default.equal((0, pit_planner_1.needsEmergencyPit)(snap({
            classId: "Hypercar",
            fuel: 80,
            fuelTankCapacity: 110,
            hybridDeployMJ: 0,
            hybridBudgetMJ: 4.5,
        })), false);
    });
    (0, node_test_1.it)("allows only deflated wheel and blocks strategic fuel", () => {
        const plan = (0, pit_planner_1.planRedFlagEmergencyPit)(snap({
            fuel: 80,
            fuelTankCapacity: 100,
            tyreDeflation: { FL: "flat" },
        }), { wet: 0 });
        strict_1.default.ok(plan);
        strict_1.default.ok(plan.parts.some((p) => p.includes("tires=FL")));
        strict_1.default.ok(!plan.parts.some((p) => p.startsWith("fuel=") && !p.includes("fuel=0")));
        strict_1.default.ok(!plan.services.driver);
    });
    (0, node_test_1.it)("caps low-fuel top-up and excludes driver swap", () => {
        const plan = (0, pit_planner_1.planRedFlagEmergencyPit)(snap({ fuel: 10, fuelTankCapacity: 100 }), { wet: 0 });
        strict_1.default.ok(plan);
        strict_1.default.match(plan.parts.join("|"), /fuel=15/);
        strict_1.default.ok(!plan.parts.some((p) => p.includes("driver_change")));
    });
    (0, node_test_1.it)("returns null for routine wear without emergency trigger", () => {
        const plan = (0, pit_planner_1.planRedFlagEmergencyPit)(snap({ fuel: 60, fuelTankCapacity: 100, tireWear: 0.95 }), { wet: 0 });
        strict_1.default.equal(plan, null);
    });
});
(0, node_test_1.describe)("planPitStop when session repair is not viable", () => {
    (0, node_test_1.it)("does not plan limp repair when session time is insufficient", () => {
        const s = snap({
            limpMode: "barely_driveable",
            sessionRepairable: false,
            totalRepairSec: 900,
            remainingSessionSec: 300,
            fuel: 20,
            tireWear: 0.9,
        });
        const plan = (0, pit_planner_1.planPitStop)(s, baseCtx, 100);
        strict_1.default.equal(plan, null);
    });
});
