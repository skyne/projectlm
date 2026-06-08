"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fleet_1 = require("./fleet");
const meta_state_1 = require("../meta_state");
function base(partial) {
    return {
        teamName: "Test",
        budget: 500000000,
        rdPoints: 100,
        playerEntryId: "entry-1",
        seasonYear: 2026,
        currentRound: 0,
        staff: [],
        unlockedParts: [],
        calendar: [],
        setupComplete: false,
        fleet: [],
        activeCarId: "",
        driverRoster: [],
        ...partial,
    };
}
(0, node_test_1.describe)("migrateLegacyMeta", () => {
    (0, node_test_1.it)("does not fabricate a car when setup is incomplete", () => {
        const migrated = (0, fleet_1.migrateLegacyMeta)(base({
            setupComplete: false,
            carBuild: {
                carName: "Ghost Car",
                chassis_type: "LMDhDallara",
                front_aero_type: "LowDragNose",
                rear_aero_type: "StandardWing",
                cooling_pack: "EnduranceHeavyDuty",
                wheel_package: "Hypercar18",
                suspension_layout: "LMDhDoubleWishbone",
                fuel_system: "LeMans110L",
                brake_system: "BremboHypercar",
                transmission: "XtracP1359",
                hybrid_system: "LMDh50kW",
            },
        }));
        strict_1.default.equal(migrated.fleet?.length ?? 0, 0);
        strict_1.default.equal(migrated.setupComplete, false);
    });
    (0, node_test_1.it)("repairs saves marked complete without core career data", () => {
        const repaired = (0, meta_state_1.normalizeSetupState)(base({
            setupComplete: true,
            fleet: [
                {
                    id: "car-1",
                    carNumber: "1",
                    classId: "Hypercar",
                    affiliation: "manufacturer",
                    acquisition: "build",
                    build: {
                        carName: "Solo Car",
                        chassis_type: "LMDhDallara",
                        front_aero_type: "LowDragNose",
                        rear_aero_type: "StandardWing",
                        cooling_pack: "EnduranceHeavyDuty",
                        wheel_package: "Hypercar18",
                        suspension_layout: "LMDhDoubleWishbone",
                        fuel_system: "LeMans110L",
                        brake_system: "BremboHypercar",
                        transmission: "XtracP1359",
                        hybrid_system: "LMDh50kW",
                    },
                    carConfigPath: "configs/runtime/fleet/car-1.txt",
                },
            ],
            activeCarId: "car-1",
            driverRoster: [],
        }));
        strict_1.default.equal(repaired.setupComplete, false);
        strict_1.default.equal(repaired.fleet?.length ?? 0, 0);
    });
});
