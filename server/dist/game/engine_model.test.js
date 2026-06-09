"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const engine_model_js_1 = require("./engine_model.js");
(0, node_test_1.describe)("validateEngineBuild", () => {
    (0, node_test_1.it)("accepts Electric BEV at 680 hp (motor torque exceeds ICE cap)", () => {
        const engine = {
            engine_layout: "V6",
            fuel_type: "Electric",
            cylinders: 6,
            bore: 0,
            stroke: 0,
            max_rpm: 12000,
            peak_torque_nm: Math.round(680 * 4.2),
            peak_torque_rpm: 10200,
            base_vibration: 0.2,
            aspiration: "NA",
            drivetrain: "FullEV",
            power_target: 680,
        };
        strict_1.default.equal((0, engine_model_js_1.validateEngineBuild)(engine), null);
    });
    (0, node_test_1.it)("accepts gasoline FullEV with motor-model torque", () => {
        const engine = {
            engine_layout: "V6",
            fuel_type: "Gasoline",
            cylinders: 6,
            bore: 0.08,
            stroke: 0.06,
            max_rpm: 12000,
            peak_torque_nm: Math.round(680 * 4.2),
            peak_torque_rpm: 10200,
            base_vibration: 0.2,
            aspiration: "NA",
            drivetrain: "FullEV",
            power_target: 680,
        };
        strict_1.default.equal((0, engine_model_js_1.validateEngineBuild)(engine), null);
    });
    (0, node_test_1.it)("still rejects ICE torque above 1200 Nm", () => {
        const engine = {
            engine_layout: "V8",
            fuel_type: "Gasoline",
            cylinders: 8,
            bore: 0.095,
            stroke: 0.078,
            max_rpm: 8500,
            peak_torque_nm: 1300,
            peak_torque_rpm: 6500,
            base_vibration: 1.0,
            aspiration: "TwinParallel",
            drivetrain: "FrontAxleHybrid",
        };
        strict_1.default.equal((0, engine_model_js_1.validateEngineBuild)(engine), "Peak torque out of range");
    });
});
