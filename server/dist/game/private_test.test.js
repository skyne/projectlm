"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const private_test_1 = require("./private_test");
const minimalBuild = {
    carName: "Car 7",
    chassis_type: "lmp2",
    front_aero_type: "lmp2_front",
    rear_aero_type: "lmp2_rear",
    cooling_pack: "lmp2_cooling",
    wheel_package: "lmp2_wheels",
    suspension_layout: "lmp2_suspension",
    fuel_system: "lmp2_fuel",
    brake_system: "lmp2_brakes",
    transmission: "lmp2_gearbox",
    hybrid_system: "none",
};
function baseMeta(overrides = {}) {
    return {
        teamName: "Test Team",
        budget: 1000000,
        rdPoints: 0,
        playerEntryId: "entry-1",
        staff: [],
        sponsors: [],
        unlockedParts: [],
        calendar: [
            {
                round: 1,
                trackId: "spa",
                format: "6h",
                eventType: "race",
                completed: false,
                championshipPoints: 0,
            },
        ],
        currentRound: 1,
        setupComplete: true,
        fleet: [
            {
                id: "car-1",
                carNumber: "7",
                classId: "Hypercar",
                carConfigPath: "configs/car.txt",
                affiliation: "privateer",
                acquisition: "privateer",
                assignedDriverIds: ["d1"],
                build: minimalBuild,
            },
        ],
        driverRoster: [
            {
                id: "d1",
                name: "Driver One",
                nationality: "GB",
                tier: "Gold",
                dryPace: 80,
                wetPace: 78,
                consistency: 80,
                overtaking: 76,
                defending: 76,
                trafficManagement: 76,
                rollingStart: 74,
                standingStart: 74,
                setupFeedback: 70,
                tireManagement: 76,
                fuelSaving: 74,
                composure: 78,
                nightPace: 74,
                rainRadar: 70,
                stamina: 78,
                maxStintHours: 2.5,
            },
        ],
        seasonYear: 2026,
        ...overrides,
    };
}
(0, node_test_1.describe)("private_test", () => {
    (0, node_test_1.it)("clamps duration hours", () => {
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(0.2), 1);
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(4.6), 5);
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(100), 72);
    });
    (0, node_test_1.it)("blocks during active race weekend", () => {
        const meta = baseMeta({
            weekendProgress: { round: 1, completedSessions: ["practice"] },
        });
        strict_1.default.equal((0, private_test_1.isRaceWeekendInProgress)(meta), true);
        strict_1.default.equal((0, private_test_1.canStartPrivateTest)(meta), false);
    });
    (0, node_test_1.it)("allows private test before weekend starts", () => {
        const meta = baseMeta();
        strict_1.default.equal((0, private_test_1.canStartPrivateTest)(meta), true);
    });
    (0, node_test_1.it)("validates payload", () => {
        const meta = baseMeta();
        const result = (0, private_test_1.validatePrivateTestPayload)(meta, {
            trackId: "spa",
            carIds: ["car-1"],
            driverAssignments: { "car-1": ["d1"] },
            durationHours: 4,
        });
        strict_1.default.ok("payload" in result);
        if ("payload" in result) {
            strict_1.default.equal(result.payload.durationHours, 4);
        }
    });
});
