"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const part_instance_seed_1 = require("./part_instance_seed");
const sampleBuild = {
    carName: "Test Car",
    chassis_type: "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: "StandardWing",
    diffuser_type: "StockFloor",
    exhaust_type: "TwinOutletSide",
    cooling_pack: "EnduranceHeavyDuty",
    wheel_package: "Hypercar18Standard",
    suspension_layout: "PushrodDoubleWishbone",
    fuel_system: "LeMans110L",
    brake_system: "BremboHypercar",
    transmission: "XtracP1359",
    hybrid_system: "LMDh50kW",
};
(0, node_test_1.describe)("part_instance_seed", () => {
    (0, node_test_1.it)("extracts catalog ids from a build", () => {
        const rows = (0, part_instance_seed_1.partTypesFromBuild)(sampleBuild);
        strict_1.default.ok(rows.some((r) => r.catalogId === "chassis.LMDhDallara"));
        strict_1.default.ok(rows.some((r) => r.catalogId === "brake.BremboHypercar"));
        strict_1.default.ok(!rows.some((r) => r.catalogId.includes("None")));
    });
    (0, node_test_1.it)("seeds inhouse instances for manufacturer builds", () => {
        const car = {
            id: "car-1",
            carNumber: "1",
            classId: "Hypercar",
            affiliation: "manufacturer",
            acquisition: "build",
            build: sampleBuild,
            carConfigPath: "configs/fleet/car-1.txt",
        };
        const merged = (0, part_instance_seed_1.mergePartInstancesFromFleet)([], [car]);
        strict_1.default.ok(merged.length >= 10);
        strict_1.default.ok(merged.every((p) => p.source === "inhouse"));
    });
    (0, node_test_1.it)("does not duplicate existing catalog ids", () => {
        const car = {
            id: "car-1",
            carNumber: "1",
            classId: "LMP2",
            affiliation: "privateer",
            acquisition: "privateer",
            build: sampleBuild,
            carConfigPath: "configs/fleet/car-1.txt",
        };
        const first = (0, part_instance_seed_1.mergePartInstancesFromFleet)([], [car]);
        const second = (0, part_instance_seed_1.mergePartInstancesFromFleet)(first, [car]);
        strict_1.default.equal(second.length, first.length);
        strict_1.default.ok(second.every((p) => p.source === "licensed"));
    });
});
