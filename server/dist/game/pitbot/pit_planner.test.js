"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const pit_planner_1 = require("./pit_planner");
(0, node_test_1.describe)("pit_planner rival aggression", () => {
    (0, node_test_1.it)("raises fuel thresholds when aggression is high", () => {
        const base = (0, pit_planner_1.scaledFuelThresholds)(1);
        const aggressive = (0, pit_planner_1.scaledFuelThresholds)(1.15);
        strict_1.default.ok(aggressive.low > base.low);
        strict_1.default.ok(aggressive.critical > base.critical);
    });
    (0, node_test_1.it)("lowers fuel thresholds when aggression is low", () => {
        const base = (0, pit_planner_1.scaledFuelThresholds)(1);
        const conservative = (0, pit_planner_1.scaledFuelThresholds)(0.85);
        strict_1.default.ok(conservative.low < base.low);
        strict_1.default.ok(conservative.critical < base.critical);
    });
});
