"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
// Mirror viewer trait rules for server-side sanity checks.
function isFuelCellBuild(engine) {
    return engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell";
}
(0, node_test_1.describe)("H2 fuel cell build encoding", () => {
    (0, node_test_1.it)("detects fuel cell from energy_converter", () => {
        const fc = {
            engine_layout: "V6",
            fuel_type: "Hydrogen",
            energy_converter: "FuelCell",
            cylinders: 6,
            bore: 0.08,
            stroke: 0.06,
            max_rpm: 12000,
            peak_torque_nm: 500,
            peak_torque_rpm: 10200,
            base_vibration: 0.2,
            drivetrain: "FullEV",
            generator_kw: 420,
        };
        node_assert_1.strict.equal(isFuelCellBuild(fc), true);
    });
    (0, node_test_1.it)("combustion H2 is not fuel cell", () => {
        const ice = {
            engine_layout: "V6",
            fuel_type: "Hydrogen",
            energy_converter: "Combustion",
            cylinders: 6,
            bore: 0.086,
            stroke: 0.075,
            max_rpm: 8500,
            peak_torque_nm: 700,
            peak_torque_rpm: 6500,
            base_vibration: 1,
            drivetrain: "FrontAxleHybrid",
        };
        node_assert_1.strict.equal(isFuelCellBuild(ice), false);
    });
});
