"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const grid_generator_1 = require("./grid_generator");
const repoRoot = node_path_1.default.resolve(process.cwd(), "..");
const minimalBuild = {
    carName: "Test",
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
(0, node_test_1.describe)("generatePlayerOnlyGrid", () => {
    (0, node_test_1.it)("creates player-only entries", () => {
        const fleet = [
            {
                id: "car-a",
                carNumber: "7",
                classId: "Hypercar",
                carConfigPath: "configs/a.txt",
                affiliation: "privateer",
                acquisition: "privateer",
                build: { ...minimalBuild, carName: "A" },
            },
            {
                id: "car-b",
                carNumber: "8",
                classId: "Hypercar",
                carConfigPath: "configs/b.txt",
                affiliation: "privateer",
                acquisition: "privateer",
                build: { ...minimalBuild, carName: "B" },
            },
        ];
        const entries = (0, grid_generator_1.generatePlayerOnlyGrid)({
            playerTeamName: "My Team",
            playerFleet: fleet,
            playerCarId: "car-a",
        });
        strict_1.default.equal(entries.length, 2);
        strict_1.default.ok(entries.every((e) => e.isPlayer));
        strict_1.default.ok(entries.every((e) => e.teamName === "My Team"));
        strict_1.default.deepEqual(entries.map((e) => e.fleetCarId), ["car-a", "car-b"]);
    });
    (0, node_test_1.it)("adds partner team entries from the Le Mans entry list", () => {
        const fleet = [
            {
                id: "car-a",
                carNumber: "7",
                classId: "Hypercar",
                carConfigPath: "configs/a.txt",
                affiliation: "privateer",
                acquisition: "privateer",
                build: { ...minimalBuild, carName: "A" },
            },
        ];
        const entries = (0, grid_generator_1.generateJointPrivateTestGrid)({
            repoRoot,
            playerTeamName: "My Team",
            playerFleet: fleet,
            partnerTeams: ["Peugeot TotalEnergies"],
        });
        strict_1.default.ok(entries.length > 1);
        strict_1.default.equal(entries[0]?.isPlayer, true);
        strict_1.default.ok(entries.some((e) => e.teamName === "Peugeot TotalEnergies" && !e.isPlayer));
    });
});
